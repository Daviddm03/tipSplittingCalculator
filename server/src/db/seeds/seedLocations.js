require("dotenv").config();

const pool = require("../pool");

const locations = [
    "Sky Bar",
    "Wine Bar 1638",
    "Wine & Jazz",
    "Pool Bar",
    "Restaurante 1638",
    "Restaurante Boa Vista",
    "Cozinha 1638",
    "Cozinha Central",
    "Housekeeping",
    "Eventos"
];

async function seedLocations() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        for (const name of locations) {
            await client.query(
                `
                    INSERT INTO locations (name)
                    VALUES ($1)
                    ON CONFLICT (name)
                    DO UPDATE SET
                        active = TRUE
                `,
                [name]
            );
        }

        await client.query("COMMIT");

        console.log(
            "10 locations seeded successfully"
        );
    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Failed to seed locations"
        );
        console.error(error.message);

        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

seedLocations();