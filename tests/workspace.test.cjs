const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateAttendanceRecords, createDemoAttendance } = require('../src/data/attendance.js');
const { summarizeWorkspace, filterEmployees, buildDistributionSnapshot } = require('../src/distribution-state.js');
const { distributeTips } = require('../src/distribution.js');

const team = [
    { id: 1, name: 'José', reference: 'EMP-001', role: 'Barman', outlet: 'Sky Bar', daysWorked: 20, workedMinutes: 9600, included: true, attention: false },
    { id: 2, name: 'Maria', reference: 'EMP-002', role: 'Hostess', outlet: 'Restaurant', daysWorked: 10, workedMinutes: 4800, included: false, attention: true }
];

test('visible attendance and included allocation totals have explicit separate scopes', () => {
    const preview = distributeTips(10000, [team[0]]);
    const summary = summarizeWorkspace(team, team, preview);
    assert.equal(summary.includedCount, 1);
    assert.equal(summary.includedDays, 20);
    assert.equal(summary.visibleDays, 30);
    assert.equal(summary.visibleMinutes, 14400);
    assert.equal(summary.visiblePayoutCents, 10000);
    assert.equal(summarizeWorkspace(team, [team[1]], preview).visiblePayoutCents, 0);
});

test('filters match accented identities and never alter the allocation population', () => {
    const before = structuredClone(team);
    assert.deepEqual(filterEmployees(team, { search: 'jose', outlet: 'all', status: 'all' }), [team[0]]);
    assert.deepEqual(filterEmployees(team, { search: '', outlet: 'Restaurant', status: 'attention' }), [team[1]]);
    assert.deepEqual(filterEmployees(team, { search: '', outlet: 'all', status: 'excluded' }), [team[1]]);
    assert.deepEqual(team, before);
});

test('search matches employee ID, role and outlet independently of inclusion', () => {
    for (const search of ['EMP-002', 'hostess', 'restaurant']) {
        assert.deepEqual(filterEmployees(team, { search, outlet: 'all', status: 'all' }), [team[1]]);
    }
});

test('demo attendance is deterministic, covers leap months, and explains overnight clock-outs', () => {
    const employee = { id: 1, name: 'José', outlet: 'Sky Bar' };
    const records = generateAttendanceRecords(employee, '2024-02');
    assert.equal(records.length, 29);
    assert.deepEqual(records, generateAttendanceRecords(employee, '2024-02'));
    const worked = records.filter(row => row.status === 'worked');
    assert.ok(worked.some(row => row.clockOutNextDay));
    for (const row of worked) assert.ok(row.workedMinutes > 0);
    const [summary] = createDemoAttendance([employee], '2024-02');
    assert.equal(summary.daysWorked, worked.length);
    assert.equal(summary.workedMinutes, worked.reduce((sum, row) => sum + row.workedMinutes, 0));
    assert.throws(() => generateAttendanceRecords(employee, '2024-13'), /period/i);
});

test('confirmation snapshots retain attendance evidence without referencing mutable UI data', () => {
    const employees = createDemoAttendance([{ id: 1, name: 'José', outlet: 'Sky Bar' }], '2026-09');
    const preview = distributeTips(10000, employees);
    const record = buildDistributionSnapshot('2026-09', 'TS-DEMO-2026-09', employees, preview);
    employees[0].attendance[0].status = 'changed';
    assert.notEqual(record.attendanceSnapshot[0].attendance[0].status, 'changed');
    assert.equal(record.periodMonth, 9);
    assert.equal(record.totalDistributedCents, 10000);
    assert.equal(record.attendanceSource, 'locally-generated-demo');
    assert.equal(record.payments[0].amountCents, 10000);
});
