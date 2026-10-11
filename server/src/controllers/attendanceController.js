const attendanceRepository = require(
    "../repositories/attendanceRepository"
);

async function getMonthlyAttendance(req, res) {
    try {
        const year = Number(req.query.year);
        const month = Number(req.query.month);

        if (
            !Number.isInteger(year) ||
            year < 2000 ||
            year > 2100
        ) {
            return res.status(400).json({
                error: "Invalid year"
            });
        }

        if (
            !Number.isInteger(month) ||
            month < 1 ||
            month > 12
        ) {
            return res.status(400).json({
                error: "Invalid month"
            });
        }

        const employees =
            await attendanceRepository.findMonthlyAttendance(
                year,
                month
            );

        return res.status(200).json({
            period: {
                year,
                month
            },
            source: "demo_hr",
            employees
        });
    } catch (error) {
        console.error(
            "Failed to fetch attendance:",
            error.message
        );

        return res.status(500).json({
            error: "Failed to fetch attendance"
        });
    }
}

module.exports = {
    getMonthlyAttendance
};