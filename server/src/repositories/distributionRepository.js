const pool = require("../db/pool");

const attendanceRepository = require("./attendanceRepository");

async function findParticipants(year, month, database = pool) {
    const employees = await attendanceRepository.findMonthlyAttendance(year, month, database);
    return participantsFromEmployees(employees);
}

function participantsFromEmployees(employees) {
    return employees.filter((employee) => employee.daysWorked > 0).map((employee) => ({
        employee_id: employee.id,
        employee_code: employee.reference,
        employee_name: employee.name,
        role: employee.role,
        location_names: employee.locations.map((location) => location.name).join(", "),
        worked_days: employee.daysWorked,
        worked_minutes: employee.workedMinutes
    }));
}

async function withTransaction(callback, readOnly = false) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ" + (readOnly ? " READ ONLY" : ""));
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function findByIdempotencyKey(idempotencyKey, database = pool) {
    const result = await database.query(
        `
            SELECT id
            FROM distributions
            WHERE idempotency_key = $1
        `,
        [idempotencyKey]
    );

    return result.rows[0] || null;
}

async function findAll() {
    const result = await pool.query(`
        SELECT
            d.id,
            d.reference,
            TO_CHAR(
                d.period_start,
                'YYYY-MM-DD'
            ) AS period_start,
            d.pool_cents,
            d.status,
            d.allocation_method,
            d.confirmed_at,
            COUNT(di.id)::INTEGER AS employee_count,
            COALESCE(
                SUM(di.payout_cents),
                0
            ) AS allocated_cents
        FROM distributions d
        LEFT JOIN distribution_items di
            ON di.distribution_id = d.id
        GROUP BY d.id
        ORDER BY d.confirmed_at DESC
    `);

    return result.rows;
}

async function findById(id, database = pool) {
    const distributionResult = await database.query(
        `
            SELECT
                id,
                reference,
                TO_CHAR(
                    period_start,
                    'YYYY-MM-DD'
                ) AS period_start,
                pool_cents,
                status,
                allocation_method,
                attendance_source,
                confirmed_at,
                created_at
            FROM distributions
            WHERE id = $1
        `,
        [id]
    );

    if (distributionResult.rows.length === 0) {
        return null;
    }

    const itemsResult = await database.query(
        `
            SELECT
                employee_id,
                employee_code,
                employee_name,
                location_names,
                role,
                worked_days,
                worked_minutes,
                payout_cents
            FROM distribution_items
            WHERE distribution_id = $1
            ORDER BY employee_name ASC
        `,
        [id]
    );

    return {
        distribution: distributionResult.rows[0],
        items: itemsResult.rows
    };
}

async function createDistribution(data, client) {
    if (!client) return withTransaction((transaction) => createDistribution(data, transaction));

    const distributionResult = await client.query(
        `
            INSERT INTO distributions (
                reference,
                period_start,
                pool_cents,
                status,
                allocation_method,
                attendance_source,
                idempotency_key
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `,
        [
            data.reference,
            data.periodStart,
            data.poolCents,
            "confirmed",
            "worked_days",
            "demo_hr",
            data.idempotencyKey
        ]
    );

    const distribution = distributionResult.rows[0];

    for (const participant of data.participants) {
        const allocation = data.allocations.find(
            item =>
                item.employeeId ===
                participant.employee_id
        );

        await client.query(
            `
                INSERT INTO distribution_items (
                    distribution_id,
                    employee_id,
                    employee_code,
                    employee_name,
                    location_names,
                    role,
                    worked_days,
                    worked_minutes,
                    payout_cents
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9
                )
            `,
            [
                distribution.id,
                participant.employee_id,
                participant.employee_code,
                participant.employee_name,
                participant.location_names,
                participant.role,
                participant.worked_days,
                participant.worked_minutes,
                allocation.payoutCents
            ]
        );
    }

    return distribution;
}

module.exports = {
    findParticipants,
    participantsFromEmployees,
    withTransaction,
    findByIdempotencyKey,
    findAll,
    findById,
    createDistribution
};
