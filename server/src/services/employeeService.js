const repository = require("../repositories/employeeRepository");
const { ApiError, validateBody, validateBoolean, validateId } = require("./settingsValidation");

function normalizeEmployee(employee) {
    return {
        id: employee.id,
        employeeCode: employee.employee_code,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        locations: employee.locations || [],
        active: employee.active,
        createdAt: employee.created_at,
        updatedAt: employee.updated_at
    };
}

function validateText(value, field, maximum) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new ApiError(400, "INVALID_EMPLOYEE", `${field} must contain 1 to ${maximum} characters without control characters.`);
    }
    return value.trim();
}

function validateLocationIds(value) {
    if (!Array.isArray(value) || value.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) {
        throw new ApiError(400, "INVALID_LOCATION_IDS", "Location IDs must be an array of valid IDs.");
    }
    return [...new Set(value)];
}

function validateEmployee(body, partial = false) {
    validateBody(body, ["employeeCode", "name", "email", "role", "locationIds", "active"], partial);
    const data = {
        employeeCode: validateText(body.employeeCode, "Employee code", 20),
        name: validateText(body.name, "Name", 120),
        role: validateText(body.role, "Role", 100)
    };
    if (Object.hasOwn(body, "email")) {
        if (body.email !== null && (typeof body.email !== "string" || body.email.trim().length > 255 || /[\u0000-\u001f\u007f]/u.test(body.email))) {
            throw new ApiError(400, "INVALID_EMPLOYEE", "Email must contain no more than 255 characters without control characters.");
        }
        data.email = body.email?.trim() || null;
    } else if (!partial) {
        data.email = null;
    }
    if (Object.hasOwn(body, "active")) data.active = validateBoolean(body.active, "INVALID_ACTIVE", "Active");
    else if (!partial) data.active = true;
    if (Object.hasOwn(body, "locationIds")) data.locationIds = validateLocationIds(body.locationIds);
    else if (!partial) data.locationIds = [];
    return data;
}

async function mutate(operation) {
    try { return await operation(); }
    catch (error) {
        if (error.code === "23505") throw new ApiError(409, "EMPLOYEE_EXISTS", "Employee code or email already exists.");
        if (error.code === "23503") throw new ApiError(400, "LOCATION_NOT_FOUND", "One or more locations do not exist.");
        throw error;
    }
}

async function getEmployees() {
    return (await repository.findAll()).map(normalizeEmployee);
}

async function createEmployee(body) {
    const data = validateEmployee(body);
    return normalizeEmployee(await mutate(() => repository.create(data)));
}

async function updateEmployee(id, body) {
    const employeeId = validateId(id);
    const data = validateEmployee(body, true);
    const employee = await mutate(() => repository.update(employeeId, data));
    if (!employee) throw new ApiError(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
    return normalizeEmployee(employee);
}

module.exports = { getEmployees, createEmployee, updateEmployee };
