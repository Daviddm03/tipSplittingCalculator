const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { formatAttendanceDuration, currentAttendancePeriod, parseAttendancePeriod } = require('../src/data/attendance.js');
const { summarizeWorkspace, validateConfirmedDistribution } = require('../src/distribution-state.js');

function adapter(responses) {
    const requests = [];
    const context = vm.createContext({ fetch: async (url, options) => {
        requests.push({ url, ...options });
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return { ok: true, status: 200, json: async () => next };
    } });
    vm.runInContext(fs.readFileSync('src/services/distribution-api.js', 'utf8'), context);
    return { repository: context.createDistributionRepository(), requests };
}
const employee = () => ({ id: 7, reference: 'EMP7', name: 'Alex', role: 'Server', locations: [],
    daysWorked: 1, workedMinutes: 90, eligible: true, absences: 1, vacationDays: 1, daysOff: 1,
    attendance: ['worked', 'absence', 'vacation', 'day_off'].map((status, index) => ({
        date: `2026-10-0${index + 1}`, status, clockIn: status === 'worked' ? '09:00' : null,
        clockOut: status === 'worked' ? '10:30' : null, clockOutNextDay: false,
        workedMinutes: status === 'worked' ? 90 : 0
    })) });
const response = () => ({ period: { year: 2026, month: 10 }, source: 'demo_hr', employees: [employee()] });

test('current month follows Lisbon at a UTC month boundary and periods match the API range', () => {
    assert.deepEqual(currentAttendancePeriod(new Date('2026-09-30T23:30:00Z')), { year: 2026, month: 10 });
    assert.deepEqual(currentAttendancePeriod(new Date('2026-10-31T23:30:00Z')), { year: 2026, month: 10 });
    assert.equal(parseAttendancePeriod('2000-02').days, 29);
    assert.equal(parseAttendancePeriod('2100-02').days, 28);
    for (const period of ['1999-12', '2101-01', '2026-00', '2026-13', '2026-1']) {
        assert.throws(() => parseAttendancePeriod(period), /valid attendance period/);
    }
});

test('duration uses integer minutes, whole hours and explicit rounded legacy hours', () => {
    for (const [minutes, text] of [[0, '0h'], [30, '0h 30m'], [60, '1h'], [90, '1h 30m'], [10398, '173h 18m']]) {
        assert.equal(formatAttendanceDuration(minutes), text);
    }
    assert.equal(formatAttendanceDuration(0.5, 'hours'), '0h 30m');
    assert.equal(formatAttendanceDuration(173.3, 'hours'), '173h 18m');
    assert.equal(formatAttendanceDuration(1.999, 'hours'), '2h');
    assert.throws(() => formatAttendanceDuration(-1));
    assert.throws(() => formatAttendanceDuration(0.5));
});

test('attendance adapter preserves database identity/evidence and derives automatic participation', async () => {
    const { repository, requests } = adapter([response()]);
    const [saved] = await repository.loadAttendance('2026-10');
    assert.equal(saved.id, 7);
    assert.equal(saved.daysWorked, 1);
    assert.equal(saved.workedMinutes, 90);
    assert.equal(saved.eligible, true);
    assert.equal(Object.hasOwn(saved, 'included'), false);
    assert.equal(saved.attendance[3].status, 'day-off');
    assert.match(requests[0].url, /year=2026&month=10$/);
});

test('attendance fails safely for unavailable, wrong-period, malformed, duplicate and inconsistent data', async () => {
    const invalid = [];
    for (const mutate of [
        data => { data.period.month = 9; },
        data => { data.employees[0].daysWorked = 2; },
        data => { data.employees[0].workedMinutes = -1; },
        data => { data.employees[0].attendance[0].status = 'unknown'; },
        data => { data.employees[0].attendance[0].date = '2026-10-32'; },
        data => { data.employees[0].attendance[0].date = '2026-09-01'; },
        data => { data.employees.push(employee()); },
        data => { data.employees[0].attendance.push({ ...data.employees[0].attendance[0] }); },
        data => { data.employees[0].eligible = false; }
    ]) { const data = response(); mutate(data); invalid.push(data); }
    const { repository } = adapter([new Error('offline'), ...invalid]);
    await assert.rejects(repository.loadAttendance('2026-10'));
    for (const ignored of invalid) await assert.rejects(repository.loadAttendance('2026-10'), /invalid attendance/i);
});

test('automatic totals ignore obsolete selection flags and visibility filters', () => {
    const team = [{ ...employee(), included: false }, { ...employee(), id: 8, daysWorked: 0, workedMinutes: 0, included: true }];
    const summary = summarizeWorkspace(team, [team[1]], { payments: [{ id: 7, amountCents: 100 }] });
    assert.equal(summary.participantCount, 1);
    assert.equal(summary.participantDays, 1);
    assert.equal(summary.visiblePayoutCents, 0);
});

test('authoritative confirmation validates Location snapshots without obsolete outlet fields', () => {
    const record = { id: '9', reference: 'DIST9', createdAt: '2026-10-23T12:00:00Z',
        totalTipsCents: 100, totalDistributedCents: 100, totalWorkedDays: 1, employeeCount: 1,
        payments: [{ id: 7, name: 'Saved Alex', reference: 'EMP7', role: 'Saved role', locations: ['Saved location'], daysWorked: 1, workedMinutes: 90, amountCents: 100 }] };
    assert.equal(validateConfirmedDistribution(record), null);
    assert.ok(validateConfirmedDistribution({ ...record, payments: [{ ...record.payments[0], amountCents: 99 }] }));
});

const previewResponse = () => ({ ...response(), previewFingerprint: 'a'.repeat(64), calculation: {
    poolCents: 101, totalWorkedDays: 1, allocatedCents: 101, differenceCents: 0,
    allocations: [{ employeeId: 7, workedDays: 1, payoutCents: 101 }]
} });

test('preview requests the complete backend population and validates exact authoritative allocation', async () => {
    const { repository, requests } = adapter([previewResponse()]);
    const preview = await repository.preview('2026-10', 101);
    assert.equal(preview.totalDistributedCents, 101);
    assert.equal(preview.payments[0].id, 7);
    assert.equal(preview.payments[0].workedMinutes, 90);
    assert.equal(preview.previewFingerprint, 'a'.repeat(64));
    assert.deepEqual(JSON.parse(requests[0].body), { year: 2026, month: 10, poolCents: 101 });
    assert.match(requests[0].url, /distributions\/preview$/);
});

test('invalid preview allocations, identities, totals and fingerprints cannot become financial results', async () => {
    for (const mutate of [
        data => { data.calculation.allocations[0].employeeId = 999; },
        data => { data.calculation.allocations[0].payoutCents = 100; },
        data => { data.calculation.totalWorkedDays = 2; },
        data => { data.previewFingerprint = 'invalid'; },
        data => { data.calculation.allocations = []; }
    ]) {
        const data = previewResponse(); mutate(data);
        await assert.rejects(adapter([data]).repository.preview('2026-10', 101), /invalid distribution/i);
    }
});

test('confirmation sends no manual IDs or client snapshot and uses only persisted metadata', async () => {
    const snapshot = { id: 9, reference: 'SAVED9', periodStart: '2026-10-01', poolCents: 101,
        status: 'confirmed', allocationMethod: 'worked_days', attendanceSource: 'demo_hr',
        confirmedAt: '2026-10-23T12:00:00Z', employeeCount: 1, allocatedCents: 101, differenceCents: 0,
        items: [{ employeeId: 7, employeeCode: 'SAVED7', employeeName: 'Saved name', locations: ['Saved location'],
            role: 'Saved role', workedDays: 1, workedMinutes: 90, payoutCents: 101 }] };
    const { repository, requests } = adapter([previewResponse(), { snapshot }]);
    const preview = await repository.preview('2026-10', 101);
    const saved = await repository.confirm('test-draft-id', preview);
    assert.deepEqual(JSON.parse(requests[1].body), { year: 2026, month: 10, poolCents: 101,
        previewFingerprint: 'a'.repeat(64), idempotencyKey: 'test-draft-id' });
    assert.equal(saved.payments[0].name, 'Saved name');
    assert.equal(saved.payments[0].role, 'Saved role');
    assert.equal(saved.payments[0].locations[0], 'Saved location');
    assert.equal(saved.payments[0].amountCents, preview.payments[0].amountCents);
    assert.equal(validateConfirmedDistribution(saved), null);
});
