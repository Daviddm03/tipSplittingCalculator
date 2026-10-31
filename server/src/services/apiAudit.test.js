const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const app = require("../app");
const pool = require("../db/pool");
const employees = require("../repositories/employeeRepository");
const attendance = require("../repositories/attendanceRepository");
const distributions = require("../repositories/distributionRepository");

let server;
let base;
let savedEmployee;
let employeeCalls = 0;
let attendanceCalls = 0;
let requestedDistributionId;
let employeeFailure;
const employee = { employeeCode: "E1", name: "Alex", role: "Server", email: null, active: true };

before(async () => {
    employees.create = async (data) => {
        employeeCalls += 1;
        if (employeeFailure) throw employeeFailure;
        savedEmployee = data;
        return { id: 1, employee_code: data.employeeCode, ...data, locations: [] };
    };
    employees.update = async (id, data) => {
        employeeCalls += 1;
        if (employeeFailure) throw employeeFailure;
        savedEmployee = data;
        return id === 999 ? null : { id, employee_code: data.employeeCode, ...data, locations: [] };
    };
    attendance.findMonthlyAttendance = async () => { attendanceCalls += 1; return []; };
    distributions.findById = async (id) => { requestedDistributionId = id; return null; };
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
});

async function request(route, method = "GET", body) {
    const response = await fetch(base + route, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
}

test("employee IDs must be canonical positive PostgreSQL INTEGER values before repository access", async () => {
    const callsBefore = employeeCalls;
    for (const id of ["0", "-1", "1.5", "1e0", "01", "%201", "2147483648", "9007199254740992"]) {
        const result = await request(`/employees/${id}`, "PATCH", employee);
        assert.equal(result.status, 400, id);
        assert.equal(result.data.code, "INVALID_ID");
    }
    assert.equal(employeeCalls, callsBefore);
});

test("employee mutations reject unknown properties, invalid booleans and control characters", async () => {
    const callsBefore = employeeCalls;
    for (const changes of [{ unexpected: true }, { active: null }, { active: "false" }, { name: "Alex\u0001" }, { role: "Server\n" }, { employeeCode: "E\u007f" }, { email: "a\u0000b" }]) {
        const result = await request("/employees/1", "PATCH", { ...employee, ...changes });
        assert.equal(result.status, 400, JSON.stringify(changes));
        assert.equal(typeof result.data.code, "string");
    }
    assert.equal(employeeCalls, callsBefore);
});

test("employee body and location validation rejects malformed values without persistence", async () => {
    const callsBefore = employeeCalls;
    const invalid = [null, [], {}, { ...employee, name: " " }, { ...employee, role: false },
        { ...employee, employeeCode: "E".repeat(21) }, { ...employee, name: "A".repeat(121) },
        { ...employee, email: "e".repeat(256) }, { ...employee, locationIds: null },
        { ...employee, locationIds: ["1"] }, { ...employee, locationIds: [2147483648] }];
    for (const body of invalid) assert.equal((await request("/employees", "POST", body)).status, 400);
    assert.equal(employeeCalls, callsBefore);
});

test("employee PATCH keeps omitted optional fields and intentionally clears explicit assignments/email", async () => {
    const body = { employeeCode: " E1 ", name: " Alex ", role: " Server " };
    assert.equal((await request("/employees/1", "PATCH", body)).status, 200);
    assert.equal(savedEmployee.name, "Alex");
    for (const field of ["active", "email", "locationIds"]) assert.equal(Object.hasOwn(savedEmployee, field), false, field);
    assert.equal((await request("/employees/1", "PATCH", { ...body, email: null, locationIds: [] })).status, 200);
    assert.equal(savedEmployee.email, null);
    assert.deepEqual(savedEmployee.locationIds, []);
});

test("employee creation defaults active status and empty relationships and deduplicates valid IDs", async () => {
    const { active, email, ...body } = employee;
    const created = await request("/employees", "POST", body);
    assert.equal(created.status, 201);
    assert.equal(created.data.employee.employeeCode, "E1");
    assert.equal(savedEmployee.active, true);
    assert.equal(savedEmployee.email, null);
    assert.deepEqual(savedEmployee.locationIds, []);
    await request("/employees/1", "PATCH", { ...employee, locationIds: [1, 1, 2] });
    assert.deepEqual(savedEmployee.locationIds, [1, 2]);
});

test("employee not-found and database failures use stable safe error envelopes", async () => {
    const missing = await request("/employees/999", "PATCH", employee);
    assert.equal(missing.status, 404);
    assert.equal(missing.data.code, "EMPLOYEE_NOT_FOUND");
    try {
        for (const [code, status, expectedCode] of [["23505", 409, "EMPLOYEE_EXISTS"], ["23503", 400, "LOCATION_NOT_FOUND"], ["ECONNREFUSED", 503, "DATABASE_UNAVAILABLE"], ["private", 500, "INTERNAL_ERROR"]]) {
            employeeFailure = Object.assign(new Error("private SQL and credentials"), { code });
            const result = await request("/employees", "POST", employee);
            assert.equal(result.status, status);
            assert.equal(result.data.code, expectedCode);
            assert.doesNotMatch(JSON.stringify(result.data), /private|credentials|SQL/);
        }
    } finally { employeeFailure = null; }
});

test("attendance query accepts only canonical bounded year/month fields", async () => {
    const callsBefore = attendanceCalls;
    for (const query of ["year=2026e0&month=10", "year=2026&month=%2010", "year=2026&month=010", "year=2026&month=10&extra=1", "year=2026&year=2026&month=10", "year=1999&month=10", "year=2026&month=13", "year=2026", "year=null&month=10"]) {
        const result = await request(`/attendance?${query}`);
        assert.equal(result.status, 400, query);
        assert.equal(typeof result.data.code, "string");
    }
    assert.equal(attendanceCalls, callsBefore);
    const result = await request("/attendance?year=2026&month=10");
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { period: { year: 2026, month: 10 }, source: "demo_hr", employees: [] });
});

test("History detail permits safe BIGINT IDs while rejecting noncanonical or unsafe IDs", async () => {
    for (const id of ["2147483648", "9007199254740991"]) {
        const result = await request(`/distributions/${id}`);
        assert.equal(result.status, 404, id);
        assert.equal(result.data.code, "DISTRIBUTION_NOT_FOUND");
        assert.equal(requestedDistributionId, Number(id));
    }
    for (const id of ["1e0", "01", "0", "-1", "9007199254740992"]) {
        const result = await request(`/distributions/${id}`);
        assert.equal(result.status, 400, id);
        assert.equal(result.data.code, "INVALID_ID");
    }
});
