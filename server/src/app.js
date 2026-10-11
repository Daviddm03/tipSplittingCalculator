const express = require("express");
const cors = require("cors");
const pool = require("./db/pool");
const outletRoutes = require("./routes/outletRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const distributionRoutes = require(
    "./routes/distributionRoutes"
);

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT NOW() AS database_time"
        );

        res.status(200).json({
            status: "ok",
            database: "connected",
            databaseTime: result.rows[0].database_time
        });
    } catch (error) {
        res.status(503).json({
            status: "error",
            database: "unavailable"
        });
    }
});

app.use("/api/outlets", outletRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/distributions", distributionRoutes);

module.exports = app;