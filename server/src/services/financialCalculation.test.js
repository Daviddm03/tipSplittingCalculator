const { test } = require("node:test");
const assert = require("node:assert/strict");
const { distributeTips } = require("./distributionService");

test("backend allocation keeps ID-based remainder ties independent of input order", () => {
    const participants = [9, 2, 7].map(employeeId => ({ employeeId, workedDays: 1 }));
    const amounts = rows => rows.allocations.sort((a, b) => a.employeeId - b.employeeId);
    assert.deepEqual(amounts(distributeTips(100, participants)), [
        { employeeId: 2, workedDays: 1, payoutCents: 34 },
        { employeeId: 7, workedDays: 1, payoutCents: 33 },
        { employeeId: 9, workedDays: 1, payoutCents: 33 }
    ]);
    assert.deepEqual(amounts(distributeTips(100, participants)), amounts(distributeTips(100, [...participants].reverse())));
});

test("authoritative allocation conserves cents and quota bounds including maximum safe pools", () => {
    for (const poolCents of [1, 2, 101, 123456, Number.MAX_SAFE_INTEGER]) {
        for (const days of [[1, 1, 1], [22, 18, 7, 3], [1, 30, 15, 2, 29]]) {
            const participants = days.map((workedDays, index) => ({ employeeId: index + 1, workedDays }));
            const result = distributeTips(poolCents, participants);
            const totalDays = BigInt(days.reduce((sum, value) => sum + value, 0));
            assert.equal(result.allocations.reduce((sum, item) => sum + BigInt(item.payoutCents), 0n), BigInt(poolCents));
            assert.equal(result.differenceCents, 0);
            for (const item of result.allocations) {
                const numerator = BigInt(poolCents) * BigInt(item.workedDays);
                const floor = numerator / totalDays;
                const ceil = floor + (numerator % totalDays ? 1n : 0n);
                assert.ok(BigInt(item.payoutCents) >= floor && BigInt(item.payoutCents) <= ceil);
            }
        }
    }
});
