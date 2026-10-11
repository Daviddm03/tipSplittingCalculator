const employeeRepository = require("../repositories/employeeRepository");

async function getEmployees(req, res) {
    try {
        const employees = await employeeRepository.findAll();

        res.status(200).json(employees);
    } catch (error) {
        console.error("Failed to fetch employees:", error.message);

        res.status(500).json({
            error: "Failed to fetch employees"
        });
    }
}

module.exports = {
    getEmployees
};