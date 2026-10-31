const assert = require("node:assert");
const { distributeTips } = require("./distributionService");

function runTests() {
    const exactDistribution = distributeTips(10000, [
        {
            employeeId: 1,
            workedDays: 20
        },
        {
            employeeId: 2,
            workedDays: 15
        },
        {
            employeeId: 3,
            workedDays: 15
        }
    ]);

    assert.strictEqual(exactDistribution.poolCents, 10000);
    assert.strictEqual(exactDistribution.allocatedCents, 10000);
    assert.strictEqual(exactDistribution.differenceCents, 0);

    assert.deepStrictEqual(
        exactDistribution.allocations.map(
            (allocation) => allocation.payoutCents
        ),
        [4000, 3000, 3000]
    );

    const remainderDistribution = distributeTips(1000, [
        {
            employeeId: 1,
            workedDays: 1
        },
        {
            employeeId: 2,
            workedDays: 1
        },
        {
            employeeId: 3,
            workedDays: 1
        }
    ]);

    assert.deepStrictEqual(
        remainderDistribution.allocations.map(
            (allocation) => allocation.payoutCents
        ),
        [334, 333, 333]
    );

    assert.strictEqual(remainderDistribution.allocatedCents, 1000);
    assert.strictEqual(remainderDistribution.differenceCents, 0);

    console.log("Distribution service tests passed");
}

runTests();