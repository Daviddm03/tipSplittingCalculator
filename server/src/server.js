require("dotenv").config();

const app = require("./app");
const pool = require("./db/pool");

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await pool.query("SELECT 1");

        console.log("Database connected");

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to connect to database");
        console.error(error.message);
        process.exit(1);
    }
}

startServer();