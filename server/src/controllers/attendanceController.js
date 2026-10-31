const service = require("../services/attendanceService");

async function getMonthlyAttendance(req, res, next) {
    try {
        return res.json(await service.getMonthlyAttendance(req.query));
    } catch (error) {
        return next(error);
    }
}

module.exports = { getMonthlyAttendance };
