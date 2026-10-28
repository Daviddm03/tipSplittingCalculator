const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function adapter(responses) {
    const requests = [];
    const context = vm.createContext({
        fetch: async (url, options) => {
            requests.push({ url, ...options });
            const response = responses.shift();
            if (response instanceof Error) throw response;
            return { ok: response.status < 400, status: response.status, json: async () => response.data };
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/services/distribution-api.js'), 'utf8'), context);
    return { repository: context.createDistributionRepository(), requests };
}

test('workspace updates use real partial PATCH and return persisted API values', async () => {
    const workspace = { id: 1, name: 'Persisted operation', locationsEnabled: false };
    const { repository, requests } = adapter([{ status: 200, data: { workspace } }]);
    assert.deepEqual(await repository.updateWorkspace({ locationsEnabled: false }), workspace);
    assert.equal(requests[0].url, 'http://localhost:3000/api/workspace');
    assert.equal(requests[0].method, 'PATCH');
    assert.deepEqual(JSON.parse(requests[0].body), { locationsEnabled: false });
});

test('location create and deactivate keep stable IDs and return backend state', async () => {
    const location = { id: 91, name: 'Terrace', active: true };
    const inactive = { ...location, active: false };
    const { repository, requests } = adapter([
        { status: 201, data: { location } }, { status: 200, data: { location: inactive } }
    ]);
    assert.deepEqual(await repository.createLocation({ name: 'Terrace' }), location);
    assert.deepEqual(await repository.updateLocation(91, { active: false }), inactive);
    assert.deepEqual(requests.map(request => request.method), ['POST', 'PATCH']);
    assert.equal(requests[1].url, 'http://localhost:3000/api/locations/91');
});

test('employee response envelopes are normalized and omitted assignments remain omitted', async () => {
    const employee = employeeFixture();
    const { repository, requests } = adapter([{ status: 200, data: { employee } }]);
    assert.deepEqual(await repository.updateEmployee(4, { name: employee.name }), employee);
    assert.equal(Object.hasOwn(JSON.parse(requests[0].body), 'locationIds'), false);
});

function employeeFixture() {
    return { id: 4, employeeCode: 'EMP004', name: 'Unchanged assignment', role: 'Server',
        email: null, active: true, locations: [{ id: 7, name: 'Inactive', active: false }] };
}

function historyFixture() {
    return { id: 12, reference: 'DIST12', periodStart: '2026-10-01', poolCents: 101,
        allocatedCents: 101, differenceCents: 0, employeeCount: 1,
        status: 'confirmed', allocationMethod: 'worked_days', confirmedAt: '2026-10-23T12:00:00Z' };
}

function detailFixture() {
    return { ...historyFixture(), attendanceSource: 'demo_hr', items: [{
        employeeId: 4, employeeCode: 'EMP004', employeeName: 'Saved employee', role: 'Saved role',
        locations: ['Historical location'], workedDays: 2, workedMinutes: 90, payoutCents: 101
    }] };
}

test('employee list, create and update validate complete saved envelopes without altering assignments', async () => {
    const employee = employeeFixture();
    const { repository, requests } = adapter([
        { status: 200, data: { employees: [employee] } },
        { status: 201, data: { employee } },
        { status: 200, data: { employee: { ...employee, active: false, locations: [] } } }
    ]);
    assert.deepEqual(await repository.loadEmployees(), [employee]);
    assert.deepEqual(await repository.createEmployee({ ...employee, locationIds: [7] }), employee);
    assert.deepEqual(await repository.updateEmployee(4, { active: false, locationIds: [] }), { ...employee, active: false, locations: [] });
    assert.deepEqual(JSON.parse(requests[2].body).locationIds, []);
});

test('malformed employee success envelopes fail before reaching rendering or mutation caches', async () => {
    const mutations = [
        employee => { employee.id = Number.MAX_SAFE_INTEGER + 1; },
        employee => { employee.name = ' '; },
        employee => { employee.employeeCode = null; },
        employee => { employee.role = null; },
        employee => { employee.email = {}; },
        employee => { employee.active = 'false'; },
        employee => { employee.locations[0].active = null; },
        employee => { employee.locations[0].id = -1; },
        employee => { employee.locations.push({ ...employee.locations[0] }); }
    ];
    for (const mutate of mutations) {
        const employee = employeeFixture(); mutate(employee);
        const { repository } = adapter([
            { status: 200, data: { employees: [employee] } },
            { status: 201, data: { employee } },
            { status: 200, data: { employee } }
        ]);
        await assert.rejects(repository.loadEmployees(), error => error.code === 'INVALID_EMPLOYEE_RESPONSE');
        await assert.rejects(repository.createEmployee({}), error => error.code === 'INVALID_EMPLOYEE_RESPONSE');
        await assert.rejects(repository.updateEmployee(4, {}), error => error.code === 'INVALID_EMPLOYEE_RESPONSE');
    }
    for (const data of [null, {}, { employees: [employeeFixture(), employeeFixture()] }]) {
        await assert.rejects(adapter([{ status: 200, data }]).repository.loadEmployees(), error => error.code === 'INVALID_EMPLOYEE_RESPONSE');
    }
    await assert.rejects(adapter([{ status: 201, data: {} }]).repository.createEmployee({}), error => error.code === 'INVALID_EMPLOYEE_RESPONSE');
});

test('History loads immutable persisted headers and details with exact safe-integer reconciliation', async () => {
    const detail = detailFixture();
    detail.poolCents = detail.allocatedCents = detail.items[0].payoutCents = Number.MAX_SAFE_INTEGER;
    const { repository } = adapter([
        { status: 200, data: { distributions: [historyFixture()] } },
        { status: 200, data: detail }, { status: 200, data: { distributions: [] } }
    ]);
    assert.deepEqual(await repository.loadHistory(), { distributions: [historyFixture()] });
    assert.deepEqual(await repository.loadDistribution(12), detail);
    assert.deepEqual(await repository.loadHistory(), { distributions: [] });
});

test('malformed History headers never become an empty or successful list', async () => {
    for (const mutate of [
        value => { value.id = 0; }, value => { value.reference = ''; },
        value => { value.periodStart = '2026-02-30'; }, value => { value.periodStart = '2026-10-02'; },
        value => { value.poolCents = Number.MAX_SAFE_INTEGER + 1; },
        value => { value.allocatedCents--; }, value => { value.differenceCents = 1; },
        value => { value.employeeCount = -1; }, value => { value.confirmedAt = 'invalid'; },
        value => { value.status = 'draft'; }, value => { value.allocationMethod = 'hours'; }
    ]) {
        const header = historyFixture(); mutate(header);
        await assert.rejects(adapter([{ status: 200, data: { distributions: [header] } }]).repository.loadHistory(), error => error.code === 'INVALID_HISTORY');
    }
    for (const data of [null, {}, { distributions: null }, { distributions: [historyFixture(), historyFixture()] }]) {
        await assert.rejects(adapter([{ status: 200, data }]).repository.loadHistory(), error => error.code === 'INVALID_HISTORY');
    }
});

test('History detail rejects missing, duplicate, mismatched and unsafe saved items', async () => {
    for (const mutate of [
        value => { value.id = 13; }, value => { value.items = null; },
        value => { value.items[0].employeeId = -1; }, value => { value.items[0].employeeCode = ''; },
        value => { value.items[0].employeeName = null; }, value => { value.items[0].role = null; },
        value => { value.items[0].locations = [{}]; }, value => { value.items[0].workedDays = 0.5; },
        value => { value.items[0].workedMinutes = -1; }, value => { value.items[0].payoutCents--; },
        value => { value.employeeCount++; }, value => { value.attendanceSource = ''; },
        value => { value.items.push({ ...value.items[0] }); value.employeeCount = 2; }
    ]) {
        const detail = detailFixture(); mutate(detail);
        await assert.rejects(adapter([{ status: 200, data: detail }]).repository.loadDistribution(12), error => error.code === 'INVALID_HISTORY');
    }
});

test('Location and Workspace success contracts reject unsafe identities and blank names', async () => {
    for (const id of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        const { repository } = adapter([
            { status: 200, data: { workspace: { id, name: 'Name', locationsEnabled: true } } },
            { status: 200, data: { locations: [{ id, name: 'Name', active: true }] } }
        ]);
        await assert.rejects(repository.loadWorkspace(), error => error.code === 'INVALID_WORKSPACE');
        await assert.rejects(repository.loadLocations(), error => error.code === 'INVALID_LOCATION');
    }
    for (const data of [null, { locations: [{ id: 1, name: ' ', active: true }] },
        { locations: [{ id: 1, name: 'A', active: true }, { id: 1, name: 'B', active: true }] }]) {
        await assert.rejects(adapter([{ status: 200, data }]).repository.loadLocations(), error => error.code === 'INVALID_LOCATION');
    }
});

test('failed mutations preserve stable API error codes for localization', async () => {
    const { repository } = adapter([{ status: 409, data: { error: 'Duplicate location.', code: 'LOCATION_NAME_EXISTS' } }]);
    await assert.rejects(repository.createLocation({ name: 'Duplicate' }), error =>
        error.code === 'LOCATION_NAME_EXISTS' && error.status === 409);
});

test('malformed successful workspace and location payloads cannot imply persistence success', async () => {
    const { repository } = adapter([
        { status: 200, data: { workspace: { id: 1, name: 'Name', locationsEnabled: 'false' } } },
        { status: 201, data: { location: { id: 4, name: 'Terrace' } } },
        { status: 200, data: { locations: [null] } }
    ]);
    await assert.rejects(repository.loadWorkspace(), /invalid workspace data/);
    await assert.rejects(repository.createLocation({ name: 'Terrace' }), /invalid location data/);
    await assert.rejects(repository.loadLocations(), /invalid location data/);
});
