const distributionRepository = require(
    "../repositories/distributionRepository"
);
const distributionService = require(
    "../services/distributionService"
);

function normalizeDistribution(distribution) {
    return {
        id: Number(distribution.id),
        reference: distribution.reference,
        periodStart: distribution.period_start,
        poolCents: Number(distribution.pool_cents),
        status: distribution.status,
        allocationMethod: distribution.allocation_method,
        confirmedAt: distribution.confirmed_at,
        employeeCount: Number(distribution.employee_count),
        allocatedCents: Number(distribution.allocated_cents)
    };
}

function normalizeDistributionItem(item) {
    return {
        employeeId: Number(item.employee_id),
        employeeCode: item.employee_code,
        employeeName: item.employee_name,
        outlet: item.outlet_name,
        role: item.role,
        workedDays: Number(item.worked_days),
        workedMinutes: Number(item.worked_minutes),
        payoutCents: Number(item.payout_cents)
    };
}

async function getDistributions(req, res) {
    try {
        const distributions =
            await distributionRepository.findAll();

        return res.status(200).json({
            distributions: distributions.map(
                normalizeDistribution
            )
        });
    } catch (error) {
        console.error(
            "Failed to fetch distributions:",
            error.message
        );

        return res.status(500).json({
            error: "Failed to fetch distributions"
        });
    }
}

async function getDistributionById(req, res) {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Invalid distribution ID"
            });
        }

        const result =
            await distributionRepository.findById(id);

        if (!result) {
            return res.status(404).json({
                error: "Distribution not found"
            });
        }

        const items = result.items.map(
            normalizeDistributionItem
        );

        const allocatedCents = items.reduce(
            (total, item) =>
                total + item.payoutCents,
            0
        );

        return res.status(200).json({
            id: Number(result.distribution.id),
            reference: result.distribution.reference,
            periodStart:
                result.distribution.period_start,
            poolCents:
                Number(result.distribution.pool_cents),
            status: result.distribution.status,
            allocationMethod:
                result.distribution.allocation_method,
            attendanceSource:
                result.distribution.attendance_source,
            confirmedAt:
                result.distribution.confirmed_at,
            employeeCount: items.length,
            allocatedCents,
            differenceCents:
                Number(result.distribution.pool_cents) -
                allocatedCents,
            items
        });
    } catch (error) {
        console.error(
            "Failed to fetch distribution:",
            error.message
        );

        return res.status(500).json({
            error: "Failed to fetch distribution"
        });
    }
}

async function createDistribution(req, res) {
    try {
        const {
            year,
            month,
            poolCents,
            employeeIds,
            idempotencyKey
        } = req.body;

        if (
            !Number.isInteger(year) ||
            year < 2000 ||
            year > 2100
        ) {
            return res.status(400).json({
                error: "Invalid year"
            });
        }

        if (
            !Number.isInteger(month) ||
            month < 1 ||
            month > 12
        ) {
            return res.status(400).json({
                error: "Invalid month"
            });
        }

        if (
            !Number.isSafeInteger(poolCents) ||
            poolCents <= 0
        ) {
            return res.status(400).json({
                error: "Invalid pool"
            });
        }

        if (
            !Array.isArray(employeeIds) ||
            employeeIds.length === 0 ||
            employeeIds.some(
                id => !Number.isInteger(id)
            ) ||
            new Set(employeeIds).size !== employeeIds.length
        ) {
            return res.status(400).json({
                error: "Invalid employee IDs"
            });
        }

        if (
            typeof idempotencyKey !== "string" ||
            idempotencyKey.trim().length < 8 ||
            idempotencyKey.length > 100
        ) {
            return res.status(400).json({
                error: "Invalid idempotency key"
            });
        }

        const result =
            await distributionService.confirmDistribution({
                year,
                month,
                poolCents,
                employeeIds,
                idempotencyKey:
                    idempotencyKey.trim()
            });

        return res.status(201).json(result);
    } catch (error) {
        if (
            error.code === "DUPLICATE_DISTRIBUTION"
        ) {
            return res.status(409).json({
                error: error.message
            });
        }

        console.error(
            "Failed to create distribution:",
            error.message
        );

        return res.status(500).json({
            error: "Failed to create distribution"
        });
    }
}

module.exports = {
    getDistributions,
    getDistributionById,
    createDistribution
};