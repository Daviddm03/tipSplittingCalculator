const assert = require("node:assert/strict");
const { test } = require("node:test");
const app = require("../app");
const service = require("./distributionService");
const repository = require("../repositories/distributionRepository");

test("Distribution rejects manual employee selection and invalid input before database access", async (t) => {
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/distributions`;
    const post = async (path, body) => {
        const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
    };
    try {
        await t.test("manual employeeIds are rejected", async () => {
            const result = await post("", { year: 2026, month: 10, poolCents: 100, employeeIds: [1], idempotencyKey: "manual-test" });
            assert.equal(result.status, 400);
            assert.equal(result.data.code, "UNKNOWN_FIELDS");
        });
        for (const [name, changes, code] of [
            ["zero pool", { poolCents: 0 }, "INVALID_POOL"],
            ["negative pool", { poolCents: -1 }, "INVALID_POOL"],
            ["fractional cents", { poolCents: 1.5 }, "INVALID_POOL"],
            ["invalid year", { year: 1999 }, "INVALID_YEAR"],
            ["invalid month", { month: 13 }, "INVALID_MONTH"],
            ["unknown field", { employeeIds: [1] }, "UNKNOWN_FIELDS"]
        ]) await t.test(`preview rejects ${name}`, async () => {
            const result = await post("/preview", { year: 2026, month: 10, poolCents: 100, ...changes });
            assert.equal(result.status, 400);
            assert.equal(result.data.code, code);
        });
        await t.test("missing preview fingerprint cannot be confirmed", async () => {
            const result = await post("", { year: 2026, month: 10, poolCents: 100, idempotencyKey: "missing-fingerprint" });
            assert.equal(result.status, 400);
            assert.equal(result.data.code, "INVALID_PREVIEW");
        });
    } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("backend financial calculation keeps deterministic remainder and zero-day payout", () => {
    const result = service.distributeTips(1000, [{ employeeId: 8, workedDays: 1 }, { employeeId: 3, workedDays: 1 }, { employeeId: 4, workedDays: 1 }, { employeeId: 9, workedDays: 0 }]);
    assert.deepEqual(result.allocations.map((row) => row.payoutCents), [333, 334, 333, 0]);
    assert.equal(result.allocatedCents, 1000);
    assert.equal(result.differenceCents, 0);
});

test("concurrent idempotency collisions are safe conflicts; unrelated unique errors are preserved", async () => {
    const original = repository.withTransaction;
    const input = { year: 2026, month: 10, poolCents: 100, previewFingerprint: "a".repeat(64), idempotencyKey: "collision-test" };
    try {
        repository.withTransaction = async () => {
            const error = new Error("private SQL detail");
            error.code = "23505";
            error.constraint = "distributions_idempotency_key_key";
            throw error;
        };
        await assert.rejects(service.confirmDistribution(input), { status: 409, code: "DUPLICATE_DISTRIBUTION" });
        const unrelated = Object.assign(new Error("unrelated duplicate"), { code: "23505", constraint: "distributions_reference_key" });
        repository.withTransaction = async () => { throw unrelated; };
        await assert.rejects(service.confirmDistribution(input), (error) => error === unrelated);
    } finally { repository.withTransaction = original; }
});
