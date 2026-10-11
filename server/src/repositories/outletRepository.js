const pool = require("../db/pool");

async function findAll() {
    const result = await pool.query(`
        SELECT
            id,
            name,
            active,
            created_at
        FROM outlets
        ORDER BY id ASC
    `);

    return result.rows;
}

module.exports = {
    findAll
};