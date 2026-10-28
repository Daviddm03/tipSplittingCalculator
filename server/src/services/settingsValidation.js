class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function validateBody(body, allowed, partial = false) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new ApiError(400, "INVALID_BODY", "A JSON object is required.");
    }
    if (Object.keys(body).some((key) => !allowed.includes(key))) {
        throw new ApiError(400, "UNKNOWN_FIELDS", "The request contains unsupported fields.");
    }
    if (partial && Object.keys(body).length === 0) {
        throw new ApiError(400, "EMPTY_PATCH", "At least one setting is required.");
    }
}

function validateName(name) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || /[\u0000-\u001f\u007f]/u.test(name)) {
        throw new ApiError(400, "INVALID_NAME", "Name must contain 1 to 100 characters without control characters.");
    }
    return name.trim();
}

function validateBoolean(value, code, field) {
    if (typeof value !== "boolean") throw new ApiError(400, code, `${field} must be a boolean.`);
    return value;
}

function validateId(value, maximum = 2147483647) {
    if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
        throw new ApiError(400, "INVALID_ID", "A valid positive ID is required.");
    }
    return Number(value);
}

module.exports = { ApiError, validateBody, validateName, validateBoolean, validateId };
