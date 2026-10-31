// Explicit opt-in: all writes target session TEMP tables, never application tables.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });
const pool = require("../db/pool");
const workspace = require("./workspaceService");
const locations = require("./locationService");
const employees = require("../repositories/employeeRepository");
const employeeService = require("./employeeService");
const distributions = require("../repositories/distributionRepository");
const { confirmDistribution, previewDistribution, distributeTips } = require("./distributionService");

test("PostgreSQL Settings and preservation integration in rollback-only TEMP tables", { skip: process.env.RUN_SETTINGS_PG_TESTS !== "1" }, async (t) => {
    const client = await pool.connect();
    const original = { query: pool.query, connect: pool.connect };
    let inTransaction = false;
    try {
        await client.query("BEGIN");
        inTransaction = true;
        // Removing public from search_path prevents any unqualified SQL from reaching live tables.
        await client.query("SET LOCAL search_path TO pg_temp");
        const initial = fs.readFileSync(path.join(__dirname, "../db/migrations/001_initial_schema.sql"), "utf8")
            .replace(/\bBEGIN;|\bCOMMIT;/g, "").replace(/CREATE TABLE /g, "CREATE TEMP TABLE ");
        const migration = fs.readFileSync(path.join(__dirname, "../db/migrations/002_workspace_settings.sql"), "utf8")
            .replace(/\bBEGIN;|\bCOMMIT;/g, "").replace(/CREATE TABLE IF NOT EXISTS /g, "CREATE TEMP TABLE IF NOT EXISTS ");
        await client.query(initial);
        await client.query(migration);
        pool.query = (...args) => client.query(...args);
        // Repository transactions become savepoints inside the outer rollback-only transaction.
        pool.connect = async () => ({
            query(sql, params) {
                if (sql.startsWith("BEGIN")) return client.query("SAVEPOINT repository_mutation");
                if (sql === "COMMIT") return client.query("RELEASE SAVEPOINT repository_mutation");
                if (sql === "ROLLBACK") return client.query("ROLLBACK TO SAVEPOINT repository_mutation");
                return client.query(sql, params);
            },
            release() {}
        });

        await t.test("singleton migration seeds Tivoli Porto and reruns without overwriting saved settings", async () => {
            assert.equal((await workspace.getWorkspace()).name, "Tivoli Porto");
            await workspace.updateWorkspace({ name: "  Test hospitality  ", locationsEnabled: false });
            await client.query(migration);
            const current = await workspace.getWorkspace();
            assert.equal(current.name, "Test hospitality");
            assert.equal(current.locationsEnabled, false);
            assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM workspaces")).rows[0].count, 1);
        });

        const first = await locations.createLocation({ name: "  Sky Bar  " });
        const second = await locations.createLocation({ name: "Wine Bar" });
        const employee = await employees.create({ employeeCode: "PG1", name: "Alex", email: null, role: "Server", active: true, locationIds: [first.id, second.id] });
        const other = await employees.create({ employeeCode: "PG2", name: "Sam", email: null, role: "Server", active: true, locationIds: [] });
        const employeeData = { employeeCode: "PG1", name: "Alex renamed", email: null, role: "Server", active: true };

        await t.test("employee PATCH omission preserves inactive status and email, while explicit null clears email", async () => {
            await client.query("UPDATE employees SET active = false, email = 'sam@example.test' WHERE id = $1", [other.id]);
            const body = { employeeCode: "PG2", name: "Sam", role: "Server" };
            const preserved = await employeeService.updateEmployee(String(other.id), body);
            assert.equal(preserved.active, false);
            assert.equal(preserved.email, "sam@example.test");
            assert.deepEqual(preserved.locations, []);
            const cleared = await employeeService.updateEmployee(String(other.id), { ...body, email: null, active: true });
            assert.equal(cleared.email, null);
            assert.equal(cleared.active, true);
        });

        await t.test("location rename/deactivation preserves IDs and all employee relationships", async () => {
            const changed = await locations.updateLocation(first.id, { name: "Sky Lounge", active: false });
            assert.equal(changed.id, first.id);
            const current = await employees.findById(employee.id);
            assert.deepEqual(current.locations.map((row) => row.id).sort(), [first.id, second.id].sort());
            assert.equal(current.locations.find((row) => row.id === first.id).active, false);
            assert.equal((await locations.getLocations()).length, 2);
        });
        await t.test("employee edits preserve omitted assignments and allow retaining inactive assignments", async () => {
            await client.query("UPDATE employee_locations SET created_at = '2020-01-01' WHERE employee_id = $1", [employee.id]);
            const originalRelationships = (await client.query("SELECT * FROM employee_locations WHERE employee_id = $1 ORDER BY location_id", [employee.id])).rows;
            await employees.update(employee.id, employeeData);
            assert.equal((await employees.findById(employee.id)).locations.length, 2);
            await employees.update(employee.id, { ...employeeData, locationIds: [first.id, second.id] });
            assert.equal((await employees.findById(employee.id)).locations.length, 2);
            assert.deepEqual((await client.query("SELECT * FROM employee_locations WHERE employee_id = $1 ORDER BY location_id", [employee.id])).rows, originalRelationships);
        });
        await t.test("inactive new assignments are rejected atomically and existing data is preserved", async () => {
            await assert.rejects(employees.update(other.id, { ...employeeData, employeeCode: "PG2", name: "Changed", locationIds: [first.id] }), { code: "INACTIVE_LOCATION" });
            assert.equal((await employees.findById(other.id)).name, "Sam");
            assert.deepEqual((await employees.findById(other.id)).locations, []);
            await assert.rejects(employees.create({ ...employeeData, employeeCode: "PG3", locationIds: [first.id] }), { code: "INACTIVE_LOCATION" });
            assert.equal((await employees.findAll()).length, 2);
        });
        await t.test("location duplicate names return a safe conflict without losing existing locations", async () => {
            await client.query("SAVEPOINT duplicate_name");
            await assert.rejects(locations.createLocation({ name: "Wine Bar" }), { code: "LOCATION_NAME_EXISTS", status: 409 });
            await client.query("ROLLBACK TO SAVEPOINT duplicate_name");
            assert.equal((await locations.getLocations()).length, 2);
        });

        await client.query("INSERT INTO attendance (employee_id, work_date, status) VALUES ($1, '2026-01-02', 'worked'), ($1, '2026-01-03', 'worked'), ($2, '2026-01-02', 'worked')", [employee.id, other.id]);
        let confirmed;
        let history;
        await t.test("Worked Days confirms exact pool conservation with inactive location metadata", async () => {
            const input = { year: 2026, month: 1, poolCents: 1000 };
            const preview = await previewDistribution(input);
            confirmed = await confirmDistribution({ ...input, previewFingerprint: preview.previewFingerprint, idempotencyKey: "settings-pg-test" });
            assert.deepEqual(confirmed.calculation.allocations.map((row) => row.payoutCents), [667, 333]);
            assert.equal(confirmed.calculation.differenceCents, 0);
            history = await distributions.findById(confirmed.distribution.id);
            assert.match(history.items.find((row) => row.employee_id === employee.id).location_names, /Sky Lounge/);
        });
        await t.test("workspace disable/re-enable and location mutations preserve financial results and confirmed snapshots", async () => {
            await workspace.updateWorkspace({ locationsEnabled: false });
            await locations.updateLocation(first.id, { name: "Completely renamed", active: true });
            await locations.updateLocation(second.id, { active: false });
            const participants = await distributions.findParticipants(2026, 1);
            const recalculated = distributeTips(1000, participants.map((row) => ({ employeeId: row.employee_id, workedDays: row.worked_days })));
            assert.deepEqual(recalculated, confirmed.calculation);
            assert.deepEqual(await distributions.findById(confirmed.distribution.id), history);
            await workspace.updateWorkspace({ locationsEnabled: true });
            assert.equal((await employees.findById(employee.id)).locations.length, 2);
            assert.equal((await locations.getLocations()).length, 2);
            assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM attendance")).rows[0].count, 3);
        });
    } finally {
        pool.query = original.query;
        pool.connect = original.connect;
        if (inTransaction) await client.query("ROLLBACK");
        client.release();
        await pool.end();
    }
});
