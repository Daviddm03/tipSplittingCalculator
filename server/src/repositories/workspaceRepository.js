const pool = require("../db/pool");

async function findCurrent() {
    const result = await pool.query("SELECT id, name, locations_enabled, created_at, updated_at FROM workspaces WHERE id = 1");
    return result.rows[0] || null;
}

async function update(data) {
    const result = await pool.query(`
        UPDATE workspaces
        SET name = COALESCE($1, name),
            locations_enabled = COALESCE($2, locations_enabled),
            updated_at = NOW()
        WHERE id = 1
        RETURNING id, name, locations_enabled, created_at, updated_at
    `, [data.name ?? null, data.locationsEnabled ?? null]);
    return result.rows[0] || null;
}

module.exports = { findCurrent, update };
