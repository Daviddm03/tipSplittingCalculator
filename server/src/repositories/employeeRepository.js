const pool = require("../db/pool");
const { ApiError } = require("../services/settingsValidation");

const employeeSelect = `
    SELECT
        e.id,
        e.employee_code,
        e.name,
        e.email,
        e.role,
        e.active,
        e.created_at,
        e.updated_at,
        COALESCE(
            json_agg(
                json_build_object(
                    'id', l.id,
                    'name', l.name,
                    'active', l.active
                )
                ORDER BY l.name
            ) FILTER (WHERE l.id IS NOT NULL),
            '[]'
        ) AS locations
    FROM employees e
    LEFT JOIN employee_locations el
        ON el.employee_id = e.id
    LEFT JOIN locations l
        ON l.id = el.location_id
`;

async function findAll() {
    const result = await pool.query(`
        ${employeeSelect}
        GROUP BY e.id
        ORDER BY e.name ASC
    `);

    return result.rows;
}

async function findById(id) {
    const result = await pool.query(`
        ${employeeSelect}
        WHERE e.id = $1
        GROUP BY e.id
    `, [id]);

    return result.rows[0] || null;
}

async function replaceLocations(client, employeeId, locationIds, allowExistingInactive = false) {
    if (locationIds.length > 0) {
        // Share locks serialize assignment validation with location deactivation.
        const locations = await client.query(`
            SELECT id, active FROM locations WHERE id = ANY($1::integer[]) FOR SHARE
        `, [locationIds]);
        if (locations.rows.length !== locationIds.length) {
            throw new ApiError(400, "LOCATION_NOT_FOUND", "One or more locations do not exist.");
        }
        const existing = allowExistingInactive ? await client.query(`
            SELECT location_id FROM employee_locations WHERE employee_id = $1
        `, [employeeId]) : { rows: [] };
        const retained = new Set(existing.rows.map((row) => row.location_id));
        if (locations.rows.some((row) => !row.active && !retained.has(row.id))) {
            throw new ApiError(400, "INACTIVE_LOCATION", "Inactive locations cannot be assigned to new employees or added to existing employees.");
        }
    }
    await client.query(`
        DELETE FROM employee_locations
        WHERE employee_id = $1
            AND NOT (location_id = ANY($2::integer[]))
    `, [employeeId, locationIds]);

    for (const locationId of locationIds) {
        await client.query(`
            INSERT INTO employee_locations (
                employee_id,
                location_id
            )
            VALUES ($1, $2)
            ON CONFLICT (employee_id, location_id) DO NOTHING
        `, [employeeId, locationId]);
    }
}

async function create(data) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(`
            INSERT INTO employees (
                employee_code,
                name,
                email,
                role,
                active
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [
            data.employeeCode,
            data.name,
            data.email,
            data.role,
            data.active
        ]);

        const employeeId = result.rows[0].id;

        await replaceLocations(
            client,
            employeeId,
            data.locationIds
        );

        await client.query("COMMIT");

        return findById(employeeId);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function update(id, data) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Concurrent employee edits must observe the latest existing assignments.
        const current = await client.query("SELECT id FROM employees WHERE id = $1 FOR UPDATE", [id]);
        if (!current.rows[0]) {
            await client.query("ROLLBACK");
            return null;
        }

        const result = await client.query(`
            UPDATE employees
            SET
                employee_code = $1,
                name = $2,
                email = CASE WHEN $7::boolean THEN $3 ELSE email END,
                role = $4,
                active = COALESCE($5, active),
                updated_at = NOW()
            WHERE id = $6
            RETURNING id
        `, [
            data.employeeCode,
            data.name,
            data.email,
            data.role,
            data.active,
            id,
            Object.hasOwn(data, "email")
        ]);

        if (!result.rows[0]) {
            await client.query("ROLLBACK");
            return null;
        }

        if (data.locationIds !== undefined) {
            await replaceLocations(client, id, data.locationIds, true);
        }

        await client.query("COMMIT");

        return findById(id);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    findAll,
    findById,
    create,
    update
};
