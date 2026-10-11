const pool = require("../db/pool");

async function findAll() {
    const result = await pool.query(`
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
        ORDER BY e.id ASC
    `);

    return result.rows;
}

module.exports = {
    findAll
};