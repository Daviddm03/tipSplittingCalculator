const assert = require("node:assert/strict");
const { test, after } = require("node:test");
const pool = require("../db/pool");
const repository = require("./employeeRepository");

after(() => pool.end());

function memoryDatabase() {
    let state = { exists: true, name: "Alex", locationIds: [1, 2] };
    const locations = [{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: false }, { id: 4, active: true }];
    let snapshot;
    let released = false;
    const client = {
        async query(sql, params = []) {
            const query = sql.replace(/\s+/g, " ").trim();
            if (query === "BEGIN") { snapshot = structuredClone(state); return { rows: [] }; }
            if (query === "COMMIT") return { rows: [] };
            if (query === "ROLLBACK") { state = snapshot; return { rows: [] }; }
            if (query.startsWith("SELECT id FROM employees")) return { rows: state.exists ? [{ id: 1 }] : [] };
            if (query.startsWith("UPDATE employees")) { state.name = params[1]; return { rows: [{ id: 1 }] }; }
            if (query.startsWith("INSERT INTO employees")) { state.name = params[1]; state.locationIds = []; return { rows: [{ id: 1 }] }; }
            if (query.startsWith("SELECT id, active FROM locations")) return { rows: locations.filter((row) => params[0].includes(row.id)) };
            if (query.startsWith("SELECT location_id FROM employee_locations")) return { rows: state.locationIds.map((id) => ({ location_id: id })) };
            if (query.startsWith("DELETE FROM employee_locations")) { state.locationIds = state.locationIds.filter((id) => params[1].includes(id)); return { rows: [] }; }
            if (query.startsWith("INSERT INTO employee_locations")) { if (!state.locationIds.includes(params[1])) state.locationIds.push(params[1]); return { rows: [] }; }
            throw new Error(`Unexpected test query: ${query}`);
        },
        release() { released = true; }
    };
    return {
        client,
        get state() { return state; },
        get released() { return released; },
        async query() { return { rows: [{ id: 1, name: state.name, locations: state.locationIds.map((id) => locations.find((row) => row.id === id)) }] }; }
    };
}

async function withDatabase(run) {
    const database = memoryDatabase();
    const original = { connect: pool.connect, query: pool.query };
    pool.connect = async () => database.client;
    pool.query = (...args) => database.query(...args);
    try { await run(database); }
    finally { pool.connect = original.connect; pool.query = original.query; }
}
const employee = { employeeCode: "E1", name: "Alex updated", role: "Server", email: null, active: true };

test("employee update without locationIds retains active and inactive relationships", async () => {
    await withDatabase(async (database) => {
        const result = await repository.update(1, employee);
        assert.deepEqual(result.locations.map((row) => row.id), [1, 2]);
        assert.equal(result.name, "Alex updated");
        assert.equal(database.released, true);
    });
});
test("employee update retains existing inactive locations while accepting new active assignments", async () => {
    await withDatabase(async () => {
        const result = await repository.update(1, { ...employee, locationIds: [1, 2, 4] });
        assert.deepEqual(result.locations.map((row) => row.id), [1, 2, 4]);
    });
});
test("new inactive assignments are rejected and the entire employee edit rolls back", async () => {
    await withDatabase(async (database) => {
        await assert.rejects(repository.update(1, { ...employee, locationIds: [1, 2, 3] }), { code: "INACTIVE_LOCATION", status: 400 });
        assert.deepEqual(database.state.locationIds, [1, 2]);
        assert.equal(database.state.name, "Alex");
        assert.equal(database.released, true);
    });
});
test("missing locations are rejected without relationship or employee data loss", async () => {
    await withDatabase(async (database) => {
        await assert.rejects(repository.update(1, { ...employee, locationIds: [999] }), { code: "LOCATION_NOT_FOUND" });
        assert.deepEqual(database.state.locationIds, [1, 2]);
        assert.equal(database.state.name, "Alex");
    });
});
test("explicit empty locationIds intentionally removes current assignments", async () => {
    await withDatabase(async () => {
        const result = await repository.update(1, { ...employee, locationIds: [] });
        assert.deepEqual(result.locations, []);
    });
});
test("new employees cannot receive inactive locations", async () => {
    await withDatabase(async (database) => {
        await assert.rejects(repository.create({ ...employee, locationIds: [2] }), { code: "INACTIVE_LOCATION" });
        assert.equal(database.state.name, "Alex");
        assert.deepEqual(database.state.locationIds, [1, 2]);
    });
});
test("missing employees return null and leave relationships untouched", async () => {
    await withDatabase(async (database) => {
        database.state.exists = false;
        assert.equal(await repository.update(999, { ...employee, locationIds: [] }), null);
        assert.deepEqual(database.state.locationIds, [1, 2]);
    });
});
