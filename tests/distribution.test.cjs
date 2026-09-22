const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMoneyToCents, formatCents, parseDaysWorked, validateParticipants, distributeTips } = require('../distribution.js');
const team = days => days.map((daysWorked, i) => ({ id: i + 1, name: String.fromCharCode(65 + i), outlet: 'Bar', daysWorked }));
const amounts = result => result.payments.map(employee => employee.amountCents);

test('A: equal days', () => assert.deepEqual(amounts(distributeTips(10000, team([10, 10]))), [5000, 5000]));
test('B: 20 / 10 days', () => assert.deepEqual(amounts(distributeTips(10000, team([20, 10]))), [6667, 3333]));
test('C: equal remainders use stable IDs, regardless of selection order', () => {
    const people = team([1, 1, 1]);
    assert.deepEqual(amounts(distributeTips(10000, people)), [3334, 3333, 3333]);
    assert.deepEqual(amounts(distributeTips(10000, people.reverse())), [3333, 3333, 3334]);
});
test('D: 1234.56 with different days', () => {
    const result = distributeTips(parseMoneyToCents('€1.234,56'), team([22, 18, 7, 3, 0]));
    assert.deepEqual(amounts(result), [54321, 44444, 17284, 7407, 0]);
    assert.equal(result.totalDistributedCents, 123456);
    assert.equal(result.totalWorkedDays, 50);
});
test('E: no participants and zero total days block calculation', () => {
    assert.throws(() => distributeTips(10000, []));
    assert.throws(() => distributeTips(10000, team([0, 0])));
});
test('F: only selected participants affect calculation', () => {
    const selected = team([20, 10]).filter(employee => employee.id !== 1);
    assert.deepEqual(amounts(distributeTips(10000, selected)), [10000]);
});
test('money conversion is exact and supports decimal comma or dot', () => {
    for (const value of ['1234.56', '1234,56', '€1.234,56', '1,234.56']) assert.equal(parseMoneyToCents(value), 123456);
    assert.equal(parseMoneyToCents('0.29'), 29);
    assert.equal(parseMoneyToCents('0'), 0);
    assert.equal(formatCents(123456), '1,234.56');
    assert.equal(formatCents(Number.MAX_SAFE_INTEGER), '90,071,992,547,409.91');
    for (const value of ['', '-1', 'NaN', 'Infinity', '1e3', '100.005', '1.234', '1,23,4', '90071992547409.92']) assert.equal(parseMoneyToCents(value), null, value);
});
test('days must be nonnegative safe integers', () => {
    assert.equal(parseDaysWorked('0'), 0);
    assert.equal(parseDaysWorked('20'), 20);
    for (const value of ['', '-1', '1.5', '1,5', '1e2', 'NaN', 'Infinity', null, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
        assert.equal(parseDaysWorked(value), null);
        assert.throws(() => distributeTips(100, team([value])));
    }
    assert.equal(validateParticipants(team(['0', '2'])), null);
    assert.throws(() => distributeTips(100, team([Number.MAX_SAFE_INTEGER, 1])));
    assert.throws(() => distributeTips(100, [{ ...team([1])[0], id: 0 }]));
    assert.throws(() => distributeTips(100, [team([1])[0], team([1])[0]]));
});
test('money guards, zero tips, zero-day participants and sub-cent daily rate', () => {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => distributeTips(value, team([1])));
    assert.deepEqual(amounts(distributeTips(0, team([1, 2]))), [0, 0]);
    assert.deepEqual(amounts(distributeTips(1, team([0, 100, 100]))), [0, 1, 0]);
});
test('conservation and quota bounds including large intermediate products', () => {
    for (const total of [1, 29, 10000, 123456, Number.MAX_SAFE_INTEGER]) {
        for (const days of [[1, 1, 1], [0, 31, 17, 3], [4000000000, 3, 7]]) {
            const participants = team(days);
            const original = structuredClone(participants);
            const result = distributeTips(total, participants);
            assert.equal(result.payments.reduce((sum, row) => sum + BigInt(row.amountCents), 0n), BigInt(total));
            assert.deepEqual(participants, original);
            for (const row of result.payments) {
                const base = BigInt(total) * BigInt(row.daysWorked) / BigInt(result.totalWorkedDays);
                assert.ok(BigInt(row.amountCents) === base || BigInt(row.amountCents) === base + 1n);
            }
        }
    }
});
