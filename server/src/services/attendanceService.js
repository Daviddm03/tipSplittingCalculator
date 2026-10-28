const repository = require("../repositories/attendanceRepository");
const { ApiError, validateBody } = require("./settingsValidation");

async function getMonthlyAttendance(query) {
    validateBody(query, ["year", "month"]);
    if (typeof query.year !== "string" || !/^\d{4}$/.test(query.year) || Number(query.year) < 2000 || Number(query.year) > 2100) {
        throw new ApiError(400, "INVALID_YEAR", "Invalid year.");
    }
    if (typeof query.month !== "string" || !/^(?:[1-9]|1[0-2])$/.test(query.month)) {
        throw new ApiError(400, "INVALID_MONTH", "Invalid month.");
    }
    const year = Number(query.year);
    const month = Number(query.month);
    return {
        period: { year, month },
        source: "demo_hr",
        employees: await repository.findMonthlyAttendance(year, month)
    };
}

module.exports = { getMonthlyAttendance };
