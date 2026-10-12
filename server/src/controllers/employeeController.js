const employeeRepository = require("../repositories/employeeRepository");

function normalizeEmployee(employee) {
    return {
        id: Number(employee.id),
        employeeCode: employee.employee_code,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        outletId: Number(employee.outlet_id),
        outlet: employee.outlet,
        active: employee.active,
        createdAt: employee.created_at,
        updatedAt: employee.updated_at
    };
}

function validateEmployee(data) {
    if (
        typeof data.employeeCode !== "string" ||
        !data.employeeCode.trim()
    ) {
        return "Employee code is required.";
    }

    if (
        typeof data.name !== "string" ||
        !data.name.trim()
    ) {
        return "Employee name is required.";
    }

    if (
        typeof data.role !== "string" ||
        !data.role.trim()
    ) {
        return "Employee role is required.";
    }

    if (
        !Number.isInteger(data.outletId) ||
        data.outletId <= 0
    ) {
        return "Valid outlet is required.";
    }

    if (
        data.email !== null &&
        data.email !== undefined &&
        typeof data.email !== "string"
    ) {
        return "Email must be a string.";
    }

    if (
        data.active !== undefined &&
        typeof data.active !== "boolean"
    ) {
        return "Active must be a boolean.";
    }

    return null;
}

async function getEmployees(req, res) {
    try {
        const employees = await employeeRepository.findAll();

        res.status(200).json({
            employees: employees.map(normalizeEmployee)
        });
    } catch (error) {
        console.error("Failed to fetch employees:", error.message);

        res.status(500).json({
            error: "Failed to fetch employees."
        });
    }
}

async function createEmployee(req, res) {
    const validationError = validateEmployee(req.body);

    if (validationError) {
        return res.status(400).json({
            error: validationError
        });
    }

    try {
        const employee = await employeeRepository.create({
            employeeCode: req.body.employeeCode.trim(),
            name: req.body.name.trim(),
            email: req.body.email?.trim() || null,
            role: req.body.role.trim(),
            outletId: req.body.outletId,
            active: req.body.active ?? true
        });

        res.status(201).json(normalizeEmployee(employee));
    } catch (error) {
        console.error("Failed to create employee:", error.message);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "Employee code or email already exists."
            });
        }

        if (error.code === "23503") {
            return res.status(400).json({
                error: "Outlet does not exist."
            });
        }

        res.status(500).json({
            error: "Failed to create employee."
        });
    }
}

async function updateEmployee(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Invalid employee ID."
        });
    }

    const validationError = validateEmployee(req.body);

    if (validationError) {
        return res.status(400).json({
            error: validationError
        });
    }

    try {
        const employee = await employeeRepository.update(id, {
            employeeCode: req.body.employeeCode.trim(),
            name: req.body.name.trim(),
            email: req.body.email?.trim() || null,
            role: req.body.role.trim(),
            outletId: req.body.outletId,
            active: req.body.active ?? true
        });

        if (!employee) {
            return res.status(404).json({
                error: "Employee not found."
            });
        }

        res.status(200).json(normalizeEmployee(employee));
    } catch (error) {
        console.error("Failed to update employee:", error.message);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "Employee code or email already exists."
            });
        }

        if (error.code === "23503") {
            return res.status(400).json({
                error: "Outlet does not exist."
            });
        }

        res.status(500).json({
            error: "Failed to update employee."
        });
    }
}

module.exports = {
    getEmployees,
    createEmployee,
    updateEmployee
};