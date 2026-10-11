const pool = require("../db/pool");

async function findParticipants(year, month, employeeIds) {
    const result = await pool.query(
        `
            SELECT
                e.id AS employee_id,
                e.employee_code,
                e.name AS employee_name,
                e.role,
                o.name AS outlet_name,
                COUNT(*) FILTER (
                    WHERE a.status = 'worked'
                )::INTEGER AS worked_days,
                COALESCE(
                    ROUND(
                        SUM(
                            EXTRACT(
                                EPOCH FROM (a.clock_out - a.clock_in)
                            ) / 60
                        ) FILTER (
                            WHERE a.status = 'worked'
                        )
                    ),
                    0
                )::INTEGER AS worked_minutes
            FROM employees e
            JOIN outlets o
                ON e.outlet_id = o.id
            LEFT JOIN attendance a
                ON e.id = a.employee_id
                AND EXTRACT(YEAR FROM a.work_date) = $1
                AND EXTRACT(MONTH FROM a.work_date) = $2
            WHERE
                e.active = TRUE
                AND e.id = ANY($3::INTEGER[])
            GROUP BY
                e.id,
                e.employee_code,
                e.name,
                e.role,
                o.name
            ORDER BY e.id ASC
        `,
        [year, month, employeeIds]
    );

    return result.rows;
}

async function findByIdempotencyKey(idempotencyKey) {
    const result = await pool.query(
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
            TO_CHAR(d.period_start, 'YYYY-MM-DD') AS period_start,
            d.pool_cents,
            d.status,
            d.allocation_method,
            d.confirmed_at,
            COUNT(di.id)::INTEGER AS employee_count,
            COALESCE(SUM(di.payout_cents), 0) AS allocated_cents
        FROM distributions d
        LEFT JOIN distribution_items di
            ON di.distribution_id = d.id
        GROUP BY d.id
        ORDER BY d.confirmed_at DESC
    `);

    return result.rows;
}

async function findById(id) {
    const distributionResult = await pool.query(
        `
            SELECT
                id,
                reference,
                TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start,
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

    const itemsResult = await pool.query(
        `
            SELECT
                employee_id,
                employee_code,
                employee_name,
                outlet_name,
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

async function createDistribution(data) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

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
                (item) => item.employeeId === participant.employee_id
            );

            await client.query(
                `
                    INSERT INTO distribution_items (
                        distribution_id,
                        employee_id,
                        employee_code,
                        employee_name,
                        outlet_name,
                        role,
                        worked_days,
                        worked_minutes,
                        payout_cents
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `,
                [
                    distribution.id,
                    participant.employee_id,
                    participant.employee_code,
                    participant.employee_name,
                    participant.outlet_name,
                    participant.role,
                    participant.worked_days,
                    participant.worked_minutes,
                    allocation.payoutCents
                ]
            );
        }

        await client.query("COMMIT");

        return distribution;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    findParticipants,
    findByIdempotencyKey,
    findAll,
    findById,
    createDistribution
};