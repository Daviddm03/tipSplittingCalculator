const crypto = require("node:crypto");
const distributionRepository = require("../repositories/distributionRepository");

function distributeTips(poolCents, participants) {
    if (!Number.isSafeInteger(poolCents) || poolCents <= 0) {
        throw new Error("Pool must be a positive integer");
    }

    if (!Array.isArray(participants) || participants.length === 0) {
        throw new Error("At least one participant is required");
    }

    const normalizedParticipants = participants.map((participant) => {
        if (!Number.isInteger(participant.employeeId)) {
            throw new Error("Employee ID must be an integer");
        }

        if (
            !Number.isInteger(participant.workedDays) ||
            participant.workedDays < 0
        ) {
            throw new Error(
                "Worked days must be a non-negative integer"
            );
        }

        return {
            employeeId: participant.employeeId,
            workedDays: participant.workedDays
        };
    });

    const totalWorkedDays = normalizedParticipants.reduce(
        (total, participant) => total + participant.workedDays,
        0
    );

    if (totalWorkedDays <= 0) {
        throw new Error(
            "Total worked days must be greater than zero"
        );
    }

    const pool = BigInt(poolCents);
    const totalDays = BigInt(totalWorkedDays);

    const allocations = normalizedParticipants.map(
        (participant) => {
            const workedDays = BigInt(participant.workedDays);
            const numerator = pool * workedDays;

            return {
                employeeId: participant.employeeId,
                workedDays: participant.workedDays,
                payoutCents: numerator / totalDays,
                remainder: numerator % totalDays
            };
        }
    );

    const initiallyAllocated = allocations.reduce(
        (total, allocation) =>
            total + allocation.payoutCents,
        0n
    );

    let remainingCents = pool - initiallyAllocated;

    const remainderOrder = [...allocations].sort((a, b) => {
        if (a.remainder === b.remainder) {
            return a.employeeId - b.employeeId;
        }

        return a.remainder > b.remainder ? -1 : 1;
    });

    let index = 0;

    while (remainingCents > 0n) {
        remainderOrder[index].payoutCents += 1n;
        remainingCents -= 1n;
        index += 1;
    }

    const result = allocations.map((allocation) => ({
        employeeId: allocation.employeeId,
        workedDays: allocation.workedDays,
        payoutCents: Number(allocation.payoutCents)
    }));

    const allocatedCents = result.reduce(
        (total, allocation) =>
            total + allocation.payoutCents,
        0
    );

    if (allocatedCents !== poolCents) {
        throw new Error("Distribution reconciliation failed");
    }

    return {
        poolCents,
        totalWorkedDays,
        allocatedCents,
        differenceCents: poolCents - allocatedCents,
        allocations: result
    };
}

async function confirmDistribution(data) {
    const existing =
        await distributionRepository.findByIdempotencyKey(
            data.idempotencyKey
        );

    if (existing) {
        const error = new Error(
            "Distribution already confirmed"
        );

        error.code = "DUPLICATE_DISTRIBUTION";

        throw error;
    }

    const participants =
        await distributionRepository.findParticipants(
            data.year,
            data.month,
            data.employeeIds
        );

    if (participants.length !== data.employeeIds.length) {
        throw new Error(
            "One or more employees are invalid or inactive"
        );
    }

    const calculation = distributeTips(
        data.poolCents,
        participants.map((participant) => ({
            employeeId: participant.employee_id,
            workedDays: participant.worked_days
        }))
    );

    const reference =
        `DIST-${data.year}-${String(data.month).padStart(2, "0")}-` +
        crypto.randomUUID().slice(0, 8).toUpperCase();

    const periodStart =
        `${data.year}-${String(data.month).padStart(2, "0")}-01`;

    const distribution =
        await distributionRepository.createDistribution({
            reference,
            periodStart,
            poolCents: data.poolCents,
            idempotencyKey: data.idempotencyKey,
            participants,
            allocations: calculation.allocations
        });

    return {
        distribution,
        calculation
    };
}

module.exports = {
    distributeTips,
    confirmDistribution
};