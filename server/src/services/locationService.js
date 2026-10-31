const repository = require("../repositories/locationRepository");
const { ApiError, validateBody, validateName, validateBoolean, validateId } = require("./settingsValidation");

function normalize(row) {
    return { id: row.id, name: row.name, active: row.active, createdAt: row.created_at };
}

function validateLocation(body, partial) {
    validateBody(body, ["name", "active"], partial);
    const data = {};
    if (!partial || Object.hasOwn(body, "name")) data.name = validateName(body.name);
    if (Object.hasOwn(body, "active")) data.active = validateBoolean(body.active, "INVALID_ACTIVE", "Active");
    else if (!partial) data.active = true;
    return data;
}

async function getLocations() { return (await repository.findAll()).map(normalize); }

async function mutate(operation) {
    try { return await operation(); }
    catch (error) {
        if (error.code === "23505") throw new ApiError(409, "LOCATION_NAME_EXISTS", "A location with this name already exists.");
        throw error;
    }
}

async function createLocation(body) {
    const data = validateLocation(body, false);
    return normalize(await mutate(() => repository.create(data)));
}

async function updateLocation(id, body) {
    const validId = validateId(id);
    const data = validateLocation(body, true);
    const row = await mutate(() => repository.update(validId, data));
    if (!row) throw new ApiError(404, "LOCATION_NOT_FOUND", "Location not found.");
    return normalize(row);
}

module.exports = { getLocations, createLocation, updateLocation };
