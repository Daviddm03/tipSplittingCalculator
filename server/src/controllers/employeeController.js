const service = require("../services/employeeService");

async function getEmployees(req, res, next) {
    try {
        return res.json({ employees: await service.getEmployees() });
    } catch (error) {
        return next(error);
    }
}

async function createEmployee(req, res, next) {
    try {
        return res.status(201).json({ employee: await service.createEmployee(req.body) });
    } catch (error) {
        return next(error);
    }
}

async function updateEmployee(req, res, next) {
    try {
        return res.json({ employee: await service.updateEmployee(req.params.id, req.body) });
    } catch (error) {
        return next(error);
    }
}

module.exports = { getEmployees, createEmployee, updateEmployee };
