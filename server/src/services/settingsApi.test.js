const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const workspaceRepository = require("../repositories/workspaceRepository");
const locationRepository = require("../repositories/locationRepository");
const employeeRepository = require("../repositories/employeeRepository");
const pool = require("../db/pool");
const app = require("../app");

let server;
let base;
let workspace;
let locations;
let employeeData;
before(async () => {
    workspace = { id: 1, name: "Tivoli Porto", locations_enabled: true, created_at: "2026-01-01", updated_at: "2026-01-01" };
    locations = [{ id: 1, name: "Sky Bar", active: true, created_at: "2026-01-01" }];
    workspaceRepository.findCurrent = async () => ({ ...workspace });
    workspaceRepository.update = async (data) => {
        if (data.name !== undefined) workspace.name = data.name;
        if (data.locationsEnabled !== undefined) workspace.locations_enabled = data.locationsEnabled;
        return { ...workspace };
    };
    locationRepository.findAll = async () => locations.map((row) => ({ ...row }));
    locationRepository.create = async (data) => {
        if (locations.some((row) => row.name === data.name)) throw Object.assign(new Error("private SQL"), { code: "23505" });
        const row = { id: locations.length + 1, ...data, created_at: "2026-01-01" };
        locations.push(row);
        return { ...row };
    };
    locationRepository.update = async (id, data) => {
        const row = locations.find((entry) => entry.id === id);
        if (!row) return null;
        Object.assign(row, data);
        return { ...row };
    };
    employeeRepository.update = async (id, data) => { employeeData = data; return { id, name: data.name }; };
    server = await new Promise((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await pool.end(); });
async function request(path, method = "GET", body) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
}

test("workspace GET and PATCH expose persistent normalized state", async () => {
    assert.equal((await request("/workspace")).data.workspace.name, "Tivoli Porto");
    const saved = await request("/workspace", "PATCH", { name: "  New workspace  ", locationsEnabled: false });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.workspace.name, "New workspace");
    assert.equal((await request("/workspace")).data.workspace.locationsEnabled, false);
    assert.equal(locations.length, 1);
});
test("workspace rejects invalid types, unknown fields, empty patches and unsafe names", async () => {
    for (const body of [null, [], {}, { name: 12 }, { name: "  " }, { name: "a".repeat(101) }, { locationsEnabled: "false" }, { id: 7 }, { name: "bad\u0000name" }]) {
        const result = await request("/workspace", "PATCH", body);
        assert.equal(result.status, 400, JSON.stringify(body));
        assert.equal(typeof result.data.code, "string");
    }
});
test("locations can be added, renamed, deactivated, listed and reactivated without deletion", async () => {
    const created = await request("/locations", "POST", { name: "  Wine bar  " });
    assert.equal(created.status, 201);
    assert.equal(created.data.location.name, "Wine bar");
    assert.equal(created.data.location.active, true);
    const id = created.data.location.id;
    assert.equal((await request(`/locations/${id}`, "PATCH", { name: "Wine cellar", active: false })).data.location.active, false);
    assert.equal((await request("/locations")).data.locations.length, 2);
    assert.equal((await request(`/locations/${id}`, "PATCH", { active: true })).data.location.name, "Wine cellar");
    assert.equal((await fetch(`${base}/locations/${id}`, { method: "DELETE" })).status, 404);
});
test("locations reject invalid names, unknown fields, booleans and IDs", async () => {
    for (const body of [null, [], {}, { name: false }, { name: " " }, { name: "a".repeat(101) }, { name: "X", active: 1 }, { name: "X", id: 99 }]) {
        assert.equal((await request("/locations", "POST", body)).status, 400);
    }
    for (const body of [{}, { active: "true" }, { name: [] }, { createdAt: "x" }]) {
        assert.equal((await request("/locations/1", "PATCH", body)).status, 400);
    }
    for (const id of ["0", "-1", "1.2", "abc", "9007199254740992", "1e0"]) {
        assert.equal((await request(`/locations/${id}`, "PATCH", { name: "X" })).status, 400);
    }
    assert.equal((await request("/locations/999", "PATCH", { active: false })).status, 404);
});
test("duplicate and unexpected database errors never expose SQL details", async () => {
    const duplicate = await request("/locations", "POST", { name: "Sky Bar" });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.code, "LOCATION_NAME_EXISTS");
    const original = workspaceRepository.findCurrent;
    workspaceRepository.findCurrent = async () => { throw new Error("secret PostgreSQL credentials"); };
    try {
        const result = await request("/workspace");
        assert.equal(result.status, 500);
        assert.equal(result.data.code, "INTERNAL_ERROR");
        assert.doesNotMatch(JSON.stringify(result.data), /secret|PostgreSQL/);
    } finally { workspaceRepository.findCurrent = original; }
});
test("malformed JSON returns a safe JSON error", async () => {
    const response = await fetch(base + "/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{broken" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_BODY");
});
test("employee PATCH omitting locationIds preserves omission, explicit empty list clears", async () => {
    const employee = { employeeCode: "E1", name: "Alex", email: null, role: "Server", active: true };
    assert.equal((await request("/employees/1", "PATCH", employee)).status, 200);
    assert.equal(Object.hasOwn(employeeData, "locationIds"), false);
    assert.equal((await request("/employees/1", "PATCH", { ...employee, locationIds: [] })).status, 200);
    assert.deepEqual(employeeData.locationIds, []);
});
test("employee validation rejects invalid text types without crashing", async () => {
    for (const field of ["employeeCode", "name", "email", "role"]) {
        const result = await request("/employees/1", "PATCH", { employeeCode: "E1", name: "Alex", email: null, role: "Server", [field]: 42 });
        assert.equal(result.status, 400);
    }
});
