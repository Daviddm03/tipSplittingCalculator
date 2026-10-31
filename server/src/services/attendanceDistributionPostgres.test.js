// Explicit opt-in. All writes use session TEMP tables and an outer rollback.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, after } = require("node:test");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });
const pool = require("../db/pool");
const app = require("../app");
const attendance = require("../repositories/attendanceRepository");
const service = require("./distributionService");
const distributions = require("../repositories/distributionRepository");
const enabled = process.env.RUN_ATTENDANCE_PG_TESTS === "1";

async function isolatedDatabase(run) {
    const client = await pool.connect();
    const original = { query: pool.query, connect: pool.connect };
    let server;
    try {
        await client.query("BEGIN");
        await client.query("SET LOCAL search_path TO pg_temp");
        const schema = fs.readFileSync(path.join(__dirname, "../db/migrations/001_initial_schema.sql"), "utf8")
            .replace(/\bBEGIN;|\bCOMMIT;/g, "").replace(/CREATE TABLE /g, "CREATE TEMP TABLE ");
        await client.query(schema);
        pool.query = (...args) => client.query(...args);
        pool.connect = async () => ({
            query(sql, params) {
                if (sql.startsWith("BEGIN")) return client.query("SAVEPOINT distribution_request");
                if (sql === "COMMIT") return client.query("RELEASE SAVEPOINT distribution_request");
                if (sql === "ROLLBACK") return client.query("ROLLBACK TO SAVEPOINT distribution_request");
                return client.query(sql, params);
            }, release() {}
        });
        server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const request = async (route, body) => {
            const response = await fetch(base + route, body === undefined ? {} : {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
            });
            return { status: response.status, data: await response.json() };
        };
        await run(client, request);
    } finally {
        if (server) await new Promise((resolve) => server.close(resolve));
        pool.query = original.query;
        pool.connect = original.connect;
        await client.query("ROLLBACK");
        client.release();
    }
}

test("attendance -> authoritative preview -> confirmation -> immutable History in rollback TEMP PostgreSQL", { skip: !enabled }, async (t) => {
    await isolatedDatabase(async (client, request) => {
        await client.query("INSERT INTO locations(name) VALUES ('North'), ('South')");
        await client.query("INSERT INTO employees(employee_code,name,role,active) VALUES ('A','Full period','Server',true),('B','Mid period','Manager',true),('C','No worked days','Chef',true),('D','Inactive','Server',false)");
        await client.query("INSERT INTO employee_locations(employee_id,location_id) VALUES(1,1),(2,2)");
        await client.query(`INSERT INTO attendance(employee_id,work_date,status,clock_in,clock_out) VALUES
            (1,'2026-10-01','worked','2026-10-01T09:00:00Z','2026-10-01T10:00:00Z'),
            (1,'2026-10-02','worked','2026-10-02T22:30:00Z','2026-10-03T00:00:00Z'),
            (2,'2026-10-20','worked','2026-10-20T09:00:00Z','2026-10-20T09:30:00Z'),
            (3,'2026-10-01','absence',NULL,NULL),(3,'2026-10-02','vacation',NULL,NULL),
            (3,'2026-10-03','day_off',NULL,NULL),(4,'2026-10-01','worked',NULL,NULL)`);
        const input = { year: 2026, month: 10, poolCents: 1000 };
        let preview;
        let confirmed;
        await t.test("worked dates alone determine eligibility; statuses and inactive employees do not participate", async () => {
            const result = await request("/attendance?year=2026&month=10");
            assert.equal(result.status, 200);
            assert.deepEqual(result.data.employees.map((e) => [e.id, e.daysWorked, e.workedMinutes]), [[1,2,150],[2,1,30],[3,0,0]]);
            const zero = result.data.employees.find((e) => e.id === 3);
            assert.equal(zero.absences, 1);
            assert.equal(zero.vacationDays, 1);
            assert.equal(zero.daysOff, 1);
            assert.equal(result.data.employees[0].attendance[1].date, "2026-10-02");
            assert.equal(result.data.employees[0].attendance[1].clockOutNextDay, true);
        });
        await t.test("zero attendance gives a nonfinancial empty response and blocks calculation", async () => {
            const zero = await request("/attendance?year=2026&month=9");
            assert.equal(zero.status, 200);
            assert.ok(zero.data.employees.every((e) => e.daysWorked === 0 && e.workedMinutes === 0));
            const blocked = await request("/distributions/preview", { ...input, month: 9 });
            assert.equal(blocked.status, 422);
            assert.equal(blocked.data.code, "NO_ELIGIBLE_PARTICIPANTS");
            const confirmBlocked = await request("/distributions", { ...input, month: 9, previewFingerprint: "a".repeat(64), idempotencyKey: "empty-period-confirm" });
            assert.equal(confirmBlocked.status, 422);
            assert.equal(confirmBlocked.data.code, "NO_ELIGIBLE_PARTICIPANTS");
        });
        await t.test("preview uses automatic participants and exact-cent Worked Days despite hours, role and Location differences", async () => {
            const result = await request("/distributions/preview", input);
            assert.equal(result.status, 200);
            preview = result.data;
            assert.equal(preview.employees.length, 3);
            assert.equal(preview.calculation.totalWorkedDays, 3);
            assert.equal(preview.calculation.allocatedCents, 1000);
            assert.equal(preview.calculation.differenceCents, 0);
            assert.deepEqual(preview.calculation.allocations.map((a) => [a.employeeId,a.payoutCents]), [[1,667],[2,333]]);
            assert.match(preview.previewFingerprint, /^[a-f0-9]{64}$/);
            assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM distributions")).rows[0].count, 0);
        });
        await t.test("a changed pool cannot confirm a stale preview", async () => {
            const result = await request("/distributions", { ...input, poolCents: 1001, previewFingerprint: preview.previewFingerprint, idempotencyKey: "stale-pool-test" });
            assert.equal(result.status, 409);
            assert.equal(result.data.code, "PREVIEW_STALE");
        });
        await t.test("confirmation persists the exact preview and returns the saved History snapshot", async () => {
            const result = await request("/distributions", { ...input, previewFingerprint: preview.previewFingerprint, idempotencyKey: "confirmed-flow-test" });
            assert.equal(result.status, 201);
            confirmed = result.data;
            assert.deepEqual(confirmed.calculation, preview.calculation);
            assert.equal(confirmed.snapshot.periodStart, "2026-10-01");
            assert.equal(confirmed.snapshot.allocationMethod, "worked_days");
            assert.equal(confirmed.snapshot.employeeCount, 2);
            assert.equal(confirmed.snapshot.allocatedCents, 1000);
            assert.deepEqual(confirmed.snapshot.items.map((i) => [i.employeeId,i.workedDays,i.workedMinutes,i.payoutCents]), [[1,2,150,667],[2,1,30,333]]);
            const detail = await request("/distributions/" + confirmed.snapshot.id);
            assert.deepEqual(detail.data, confirmed.snapshot);
            const list = await request("/distributions");
            assert.equal(list.data.distributions[0].employeeCount, 2);
            assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM distribution_items")).rows[0].count, 2);
        });
        await t.test("repeat confirmation is a conflict and creates no second distribution", async () => {
            const result = await request("/distributions", { ...input, previewFingerprint: preview.previewFingerprint, idempotencyKey: "confirmed-flow-test" });
            assert.equal(result.status, 409);
            assert.equal(result.data.code, "DUPLICATE_DISTRIBUTION");
            assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM distributions")).rows[0].count, 1);
        });
        await t.test("changed employee metadata and attendance invalidate confirmation without rewriting saved History", async () => {
            await client.query("UPDATE employees SET name='Renamed',role='Different' WHERE id=1");
            await client.query("UPDATE locations SET name='Renamed Location',active=false WHERE id=1");
            await client.query("UPDATE attendance SET status='vacation' WHERE employee_id=1 AND work_date='2026-10-02'");
            const stale = await request("/distributions", { ...input, previewFingerprint: preview.previewFingerprint, idempotencyKey: "stale-evidence-test" });
            assert.equal(stale.status, 409);
            assert.equal(stale.data.code, "PREVIEW_STALE");
            const detail = await request("/distributions/" + confirmed.snapshot.id);
            assert.deepEqual(detail.data, confirmed.snapshot);
            const updated = await request("/distributions/preview", input);
            assert.deepEqual(updated.data.calculation.allocations.map((a) => a.payoutCents), [500,500]);
        });
        await t.test("database unavailability is a safe recoverable API error, never demo fallback", async () => {
            const original = attendance.findMonthlyAttendance;
            attendance.findMonthlyAttendance = async () => { const error = new Error("private database detail"); error.code = "ECONNREFUSED"; throw error; };
            try {
                const result = await request("/distributions/preview", input);
                assert.equal(result.status, 503);
                assert.equal(result.data.code, "DATABASE_UNAVAILABLE");
                assert.ok(!JSON.stringify(result.data).includes("private"));
            } finally { attendance.findMonthlyAttendance = original; }
            assert.equal((await request("/distributions/preview", input)).status, 200);
        });
        await t.test("a persistence failure rolls back the header and items together", async () => {
            const fresh = await request("/distributions/preview", input);
            const original = distributions.createDistribution;
            distributions.createDistribution = async (data, transaction) => {
                await original(data, transaction);
                throw new Error("failure after allocation items were inserted");
            };
            try {
                const result = await request("/distributions", { ...input, previewFingerprint: fresh.data.previewFingerprint, idempotencyKey: "rollback-insert-test" });
                assert.equal(result.status, 500);
                assert.equal(result.data.code, "INTERNAL_ERROR");
                assert.ok(!JSON.stringify(result.data).includes("inserted"));
            } finally { distributions.createDistribution = original; }
            assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM distributions")).rows[0].count, 1);
            assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM distribution_items")).rows[0].count, 2);
            const recovered = await request("/distributions", { ...input, previewFingerprint: fresh.data.previewFingerprint, idempotencyKey: "rollback-insert-test" });
            assert.equal(recovered.status, 201);
        });
    });
});

test("real local attendance clone confirms and loads History without modifying operational PostgreSQL", { skip: !enabled }, async () => {
    await isolatedDatabase(async (client, request) => {
        const checksums = async () => (await client.query(`SELECT
            (SELECT md5(COALESCE(string_agg(row_to_json(e)::text,'' ORDER BY id),'')) FROM public.employees e) AS employees,
            (SELECT md5(COALESCE(string_agg(row_to_json(a)::text,'' ORDER BY id),'')) FROM public.attendance a) AS attendance,
            (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY id),'')) FROM public.distributions d) AS distributions,
            (SELECT md5(COALESCE(string_agg(row_to_json(i)::text,'' ORDER BY id),'')) FROM public.distribution_items i) AS items`)).rows[0];
        const before = await checksums();
        await client.query("INSERT INTO pg_temp.locations(id,name,active) OVERRIDING SYSTEM VALUE SELECT id,name,active FROM public.locations");
        await client.query("INSERT INTO pg_temp.employees(id,employee_code,name,email,role,active) OVERRIDING SYSTEM VALUE SELECT id,employee_code,name,email,role,active FROM public.employees");
        await client.query("INSERT INTO pg_temp.employee_locations(employee_id,location_id) SELECT employee_id,location_id FROM public.employee_locations");
        await client.query("INSERT INTO pg_temp.attendance(employee_id,work_date,status,clock_in,clock_out,source) SELECT employee_id,work_date,status,clock_in,clock_out,source FROM public.attendance");
        const period = (await client.query("SELECT EXTRACT(YEAR FROM work_date)::int AS year, EXTRACT(MONTH FROM work_date)::int AS month FROM attendance WHERE status='worked' ORDER BY work_date DESC LIMIT 1")).rows[0];
        assert.ok(period, "local database must have worked attendance to verify the requested real-data flow");
        const input = { ...period, poolCents: 123457 };
        const loaded = await request(`/attendance?year=${period.year}&month=${period.month}`);
        const preview = await request("/distributions/preview", input);
        assert.equal(preview.status, 200);
        assert.deepEqual(preview.data.employees, loaded.data.employees);
        assert.equal(preview.data.calculation.allocations.length, loaded.data.employees.filter((e) => e.daysWorked > 0).length);
        assert.equal(preview.data.calculation.allocatedCents, input.poolCents);
        const confirmed = await request("/distributions", { ...input, idempotencyKey: "real-local-clone-flow", previewFingerprint: preview.data.previewFingerprint });
        assert.equal(confirmed.status, 201);
        assert.deepEqual(confirmed.data.calculation, preview.data.calculation);
        const detail = await request("/distributions/" + confirmed.data.snapshot.id);
        assert.deepEqual(detail.data, confirmed.data.snapshot);
        assert.deepEqual(await checksums(), before);
        console.log(`Real-data clone verified: ${period.year}-${String(period.month).padStart(2,"0")}, ${loaded.data.employees.length} active employees, ${preview.data.calculation.allocations.length} participants, ${preview.data.calculation.totalWorkedDays} Worked Days, pool ${input.poolCents} cents.`);
    });
});

after(async () => { await pool.end(); });
