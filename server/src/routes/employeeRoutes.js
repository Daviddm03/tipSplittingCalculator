const express = require("express");
const employeeController = require("../controllers/employeeController");

const router = express.Router();

router.get("/", employeeController.getEmployees);
router.post("/", employeeController.createEmployee);
router.patch("/:id", employeeController.updateEmployee);

module.exports = router;