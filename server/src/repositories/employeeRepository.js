const pool = require("../db/pool");

const employeeSelect = `
    SELECT
        e.id,
        e.employee_code,
        e.name,
        e.email,
        e.role,
        e.outlet_id,
        o.name AS outlet,
        e.active,
        e.created_at,
        e.updated_at
    FROM employees e
    JOIN outlets o
        ON e.outlet_id = o.id
`;

async function findAll() {
    const result = await pool.query(`
        ${employeeSelect}
        ORDER BY e.name ASC
    `);

    return result.rows;
}

async function findById(id) {
    const result = await pool.query(`
        ${employeeSelect}
        WHERE e.id = $1
    `, [id]);

    return result.rows[0] || null;
}

async function create(data) {
    const result = await pool.query(`
        INSERT INTO employees (
            employee_code,
            name,
            email,
            role,
            outlet_id,
            active
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    `, [
        data.employeeCode,
        data.name,
        data.email,
        data.role,
        data.outletId,
        data.active
    ]);

    return findById(result.rows[0].id);
}

async function update(id, data) {
    const result = await pool.query(`
        UPDATE employees
        SET
            employee_code = $1,
            name = $2,
            email = $3,
            role = $4,
            outlet_id = $5,
            active = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING id
    `, [
        data.employeeCode,
        data.name,
        data.email,
        data.role,
        data.outletId,
        data.active,
        id
    ]);

    if (!result.rows[0]) {
        return null;
    }

    return findById(id);
}

module.exports = {
    findAll,
    findById,
    create,
    update
};