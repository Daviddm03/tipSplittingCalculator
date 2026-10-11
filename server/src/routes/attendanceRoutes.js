const express = require("express");
const attendanceController = require("../controllers/attendanceController");

const router = express.Router();

router.get("/", attendanceController.getMonthlyAttendance);

module.exports = router;