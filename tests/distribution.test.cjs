const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMoneyToCents, formatCents } = require('../src/distribution.js');

test('money input converts comma, dot and grouped EUR values into exact cents', () => {
    for (const value of ['1234.56', '1234,56', '€1.234,56', '1,234.56', '  € 1.234,56  ']) {
        assert.equal(parseMoneyToCents(value), 123456, value);
    }
    for (const [value, cents] of [['0', 0], ['0.01', 1], ['0.29', 29], ['1.2', 120], ['0001,02', 102]]) {
        assert.equal(parseMoneyToCents(value), cents, value);
    }
});

test('money input rejects malformed, negative, fractional-cent and unsafe amounts', () => {
    for (const value of ['', '-1', 'NaN', 'Infinity', '1e3', '100.005', '1.234', '1,23,4', '90071992547409.92', null, undefined, {}, []]) {
        assert.equal(parseMoneyToCents(value), null, String(value));
    }
});

test('maximum safe integer cents retain their exact final cent through input and display', () => {
    assert.equal(parseMoneyToCents('90071992547409.91'), Number.MAX_SAFE_INTEGER);
    assert.equal(formatCents(Number.MAX_SAFE_INTEGER), '90,071,992,547,409.91');
    assert.equal(parseMoneyToCents(formatCents(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
});

test('money display keeps the expected whole and fractional cent positions', () => {
    for (const [cents, text] of [[0, '0.00'], [1, '0.01'], [10, '0.10'], [29, '0.29'], [100, '1.00'], [123456, '1,234.56']]) {
        assert.equal(formatCents(cents), text);
        assert.equal(parseMoneyToCents(text), cents);
    }
});
