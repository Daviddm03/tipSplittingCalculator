const crypto = require("node:crypto");
const distributionRepository = require("../repositories/distributionRepository");
const attendanceRepository = require("../repositories/attendanceRepository");
const { ApiError, validateBody, validateId } = require("./settingsValidation");

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

function validateDistributionInput(data, confirmation = false) {
    validateBody(data, confirmation
        ? ["year", "month", "poolCents", "idempotencyKey", "previewFingerprint"]
        : ["year", "month", "poolCents"]);
    if (!Number.isInteger(data.year) || data.year < 2000 || data.year > 2100) {
        throw new ApiError(400, "INVALID_YEAR", "Invalid year.");
    }
    if (!Number.isInteger(data.month) || data.month < 1 || data.month > 12) {
        throw new ApiError(400, "INVALID_MONTH", "Invalid month.");
    }
    if (!Number.isSafeInteger(data.poolCents) || data.poolCents <= 0) {
        throw new ApiError(400, "INVALID_POOL", "Tip Pool must be a positive amount in whole cents.");
    }
    if (confirmation) {
        if (typeof data.idempotencyKey !== "string" || data.idempotencyKey.trim().length < 8 || data.idempotencyKey.length > 100) {
            throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "Invalid idempotency key.");
        }
        if (typeof data.previewFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(data.previewFingerprint)) {
            throw new ApiError(400, "INVALID_PREVIEW", "Calculate a current preview before confirming.");
        }
    }
}

function fingerprint(data, employees) {
    // Include eligible source evidence and metadata, never presentation filters.
    const evidence = employees.filter((employee) => employee.daysWorked > 0)
        .sort((a, b) => a.id - b.id).map((employee) => ({
            id: employee.id, reference: employee.reference, name: employee.name, role: employee.role,
            locations: [...employee.locations].sort((a, b) => a.id - b.id),
            daysWorked: employee.daysWorked, workedMinutes: employee.workedMinutes,
            attendance: employee.attendance
        }));
    return crypto.createHash("sha256").update(JSON.stringify({
        year: data.year, month: data.month, poolCents: data.poolCents,
        method: "worked_days", evidence
    })).digest("hex");
}

async function calculatePreview(data, client) {
    const employees = await attendanceRepository.findMonthlyAttendance(data.year, data.month, client);
    const participants = distributionRepository.participantsFromEmployees(employees);
    if (!participants.length) {
        throw new ApiError(422, "NO_ELIGIBLE_PARTICIPANTS", "No active employees have Worked Days in this period.");
    }
    const calculation = distributeTips(data.poolCents, participants.map((participant) => ({
        employeeId: participant.employee_id, workedDays: participant.worked_days
    })));
    return {
        period: { year: data.year, month: data.month }, source: "demo_hr", employees,
        calculation, previewFingerprint: fingerprint(data, employees), participants
    };
}

async function previewDistribution(data) {
    validateDistributionInput(data);
    return distributionRepository.withTransaction(async (client) => {
        const { participants, ...preview } = await calculatePreview(data, client);
        return preview;
    }, true);
}

function normalizeDistributionSnapshot(result) {
    const items = result.items.map((item) => ({
        employeeId: Number(item.employee_id), employeeCode: item.employee_code,
        employeeName: item.employee_name,
        locations: item.location_names ? item.location_names.split(",").map((name) => name.trim()).filter(Boolean) : [],
        role: item.role, workedDays: Number(item.worked_days),
        workedMinutes: Number(item.worked_minutes), payoutCents: Number(item.payout_cents)
    }));
    const distribution = result.distribution;
    const poolCents = Number(distribution.pool_cents);
    const allocatedCents = items.reduce((sum, item) => sum + item.payoutCents, 0);
    return {
        id: Number(distribution.id), reference: distribution.reference,
        periodStart: distribution.period_start, poolCents, status: distribution.status,
        allocationMethod: distribution.allocation_method, attendanceSource: distribution.attendance_source,
        confirmedAt: distribution.confirmed_at, employeeCount: items.length,
        allocatedCents, differenceCents: poolCents - allocatedCents, items
    };
}

function normalizeDistribution(distribution) {
    const poolCents = Number(distribution.pool_cents);
    const allocatedCents = Number(distribution.allocated_cents);
    return {
        id: Number(distribution.id),
        reference: distribution.reference,
        periodStart: distribution.period_start,
        poolCents,
        status: distribution.status,
        allocationMethod: distribution.allocation_method,
        confirmedAt: distribution.confirmed_at,
        employeeCount: Number(distribution.employee_count),
        allocatedCents,
        differenceCents: poolCents - allocatedCents
    };
}

async function getDistributions() {
    return (await distributionRepository.findAll()).map(normalizeDistribution);
}

async function getDistributionById(id) {
    const distributionId = validateId(id, Number.MAX_SAFE_INTEGER);
    const result = await distributionRepository.findById(distributionId);
    if (!result) throw new ApiError(404, "DISTRIBUTION_NOT_FOUND", "Distribution not found.");
    return normalizeDistributionSnapshot(result);
}

async function confirmDistribution(data) {
    validateDistributionInput(data, true);
    const idempotencyKey = data.idempotencyKey.trim();
    try {
        return await distributionRepository.withTransaction(async (client) => {
            if (await distributionRepository.findByIdempotencyKey(idempotencyKey, client)) {
                throw new ApiError(409, "DUPLICATE_DISTRIBUTION", "Distribution already confirmed.");
            }
            const preview = await calculatePreview(data, client);
            if (preview.previewFingerprint !== data.previewFingerprint) {
                throw new ApiError(409, "PREVIEW_STALE", "Attendance or employee information changed. Calculate payouts again.");
            }
            const reference = "DIST-" + data.year + "-" + String(data.month).padStart(2, "0") + "-" + crypto.randomUUID().slice(0, 8).toUpperCase();
            const periodStart = data.year + "-" + String(data.month).padStart(2, "0") + "-01";
            const distribution = await distributionRepository.createDistribution({
                reference, periodStart, poolCents: data.poolCents, idempotencyKey,
                participants: preview.participants, allocations: preview.calculation.allocations
            }, client);
            const persisted = await distributionRepository.findById(distribution.id, client);
            return { distribution, calculation: preview.calculation, snapshot: normalizeDistributionSnapshot(persisted) };
        });
    } catch (error) {
        if (error.code === "23505" && error.constraint === "distributions_idempotency_key_key") {
            throw new ApiError(409, "DUPLICATE_DISTRIBUTION", "Distribution already confirmed.");
        }
        throw error;
    }
}

module.exports = {
    distributeTips, previewDistribution, confirmDistribution, getDistributions, getDistributionById
};
