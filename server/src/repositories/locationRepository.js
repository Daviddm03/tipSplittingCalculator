const pool = require("../db/pool");

async function findAll() {
    const result = await pool.query(`
        SELECT
            id,
            name,
            active,
            created_at
        FROM locations
        ORDER BY name ASC
    `);

    return result.rows;
}

async function findById(id) {
    const result = await pool.query(`
        SELECT
            id,
            name,
            active,
            created_at
        FROM locations
        WHERE id = $1
    `, [id]);

    return result.rows[0] || null;
}

async function create(data) {
    const result = await pool.query(`
        INSERT INTO locations (name, active) VALUES ($1, $2)
        RETURNING id, name, active, created_at
    `, [data.name, data.active]);
    return result.rows[0];
}

async function update(id, data) {
    const result = await pool.query(`
        UPDATE locations
        SET name = COALESCE($1, name), active = COALESCE($2, active)
        WHERE id = $3
        RETURNING id, name, active, created_at
    `, [data.name ?? null, data.active ?? null, id]);
    return result.rows[0] || null;
}

module.exports = {
    findAll,
    findById,
    create,
    update
};
