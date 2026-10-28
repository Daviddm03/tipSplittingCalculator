const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeWorkspace, validateConfirmedDistribution } = require('../src/distribution-state.js');
const { createStableId } = require('../src/identity.js');

test('draft idempotency identifiers are nonempty and unique across repeated creation', () => {
    const identifiers = Array.from({ length: 100 }, () => createStableId());
    assert.ok(identifiers.every(value => typeof value === 'string' && value.trim().length > 0));
    assert.equal(new Set(identifiers).size, identifiers.length);
});

const employees = () => [
    { id: 7, name: 'José', reference: 'EMP7', role: 'Server', locations: ['Sky Bar'], daysWorked: 2, workedMinutes: 960 },
    { id: 9, name: 'Maria', reference: 'EMP9', role: 'Host', locations: [], daysWorked: 1, workedMinutes: 90 },
    { id: 11, name: 'Lee', reference: 'EMP11', role: 'Chef', locations: ['Kitchen'], daysWorked: 0, workedMinutes: 0 }
];

function savedDistribution() {
    return {
        id: '42', reference: 'DIST-SAVED-42', createdAt: '2026-10-23T12:00:00Z',
        totalTipsCents: 101, totalDistributedCents: 101, totalWorkedDays: 3, employeeCount: 2,
        payments: employees().slice(0, 2).map((employee, index) => ({ ...employee, amountCents: index === 0 ? 67 : 34 }))
    };
}

test('automatic participation uses Worked Days independently of obsolete selection flags', () => {
    const team = employees().map((employee, index) => ({ ...employee, included: index === 2 }));
    assert.deepEqual(summarizeWorkspace(team, team, null), {
        employeeCount: 3, participantCount: 2, participantDays: 3, participantMinutes: 1050,
        visibleDays: 3, visibleMinutes: 1050, visiblePayoutCents: 0
    });
});

test('visibility changes only visible totals and never financial population or source data', () => {
    const team = employees();
    const original = structuredClone(team);
    const preview = savedDistribution();
    for (const visible of [[], [team[1]], [team[2]], team]) {
        const summary = summarizeWorkspace(team, visible, preview);
        assert.equal(summary.participantCount, 2);
        assert.equal(summary.participantDays, 3);
        assert.equal(summary.participantMinutes, 1050);
        assert.equal(summary.visibleDays, visible.reduce((sum, employee) => sum + employee.daysWorked, 0));
        assert.equal(summary.visiblePayoutCents, visible.reduce((sum, employee) => sum + (preview.payments.find(payment => payment.id === employee.id)?.amountCents || 0), 0));
    }
    assert.deepEqual(team, original);
});

test('empty attendance has explicit zero totals without synthetic participants', () => {
    assert.deepEqual(summarizeWorkspace([], [], null), {
        employeeCount: 0, participantCount: 0, participantDays: 0, participantMinutes: 0,
        visibleDays: 0, visibleMinutes: 0, visiblePayoutCents: 0
    });
});

test('confirmed snapshots accept saved Location metadata without current employee state', () => {
    const saved = savedDistribution();
    const before = structuredClone(saved);
    assert.equal(validateConfirmedDistribution(saved), null);
    assert.equal(Object.hasOwn(saved.payments[0], 'outlet'), false);
    const currentTeam = employees();
    currentTeam[0].name = 'Renamed current employee';
    currentTeam[0].locations = ['New current location'];
    currentTeam[0].daysWorked = 0;
    assert.equal(validateConfirmedDistribution(saved), null);
    assert.deepEqual(saved, before);
});

test('confirmed response rejects invalid identity, evidence, duplicate population and totals', () => {
    const mutations = [
        record => { record.id = ''; },
        record => { record.createdAt = 'invalid'; },
        record => { record.totalTipsCents = -1; },
        record => { record.totalDistributedCents = 100; },
        record => { record.totalWorkedDays = 4; },
        record => { record.employeeCount = 3; },
        record => { record.payments[1].id = record.payments[0].id; },
        record => { record.payments[0].id = 0; },
        record => { record.payments[0].name = ''; },
        record => { record.payments[0].locations = null; },
        record => { record.payments[0].daysWorked = 0; },
        record => { record.payments[0].workedMinutes = 0.5; },
        record => { record.payments[0].amountCents = Number.MAX_SAFE_INTEGER + 1; },
        record => { record.payments[0].amountCents--; }
    ];
    for (const mutate of mutations) {
        const record = savedDistribution();
        mutate(record);
        assert.equal(typeof validateConfirmedDistribution(record), 'string', mutate.toString());
    }
});
