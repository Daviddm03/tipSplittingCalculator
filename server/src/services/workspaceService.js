const repository = require("../repositories/workspaceRepository");
const { ApiError, validateBody, validateName, validateBoolean } = require("./settingsValidation");

function normalize(row) {
    if (!row) throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace configuration is not available.");
    return { id: row.id, name: row.name, locationsEnabled: row.locations_enabled, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function getWorkspace() { return normalize(await repository.findCurrent()); }

async function updateWorkspace(body) {
    validateBody(body, ["name", "locationsEnabled"], true);
    const data = {};
    if (Object.hasOwn(body, "name")) data.name = validateName(body.name);
    if (Object.hasOwn(body, "locationsEnabled")) data.locationsEnabled = validateBoolean(body.locationsEnabled, "INVALID_LOCATIONS_ENABLED", "Locations enabled");
    return normalize(await repository.update(data));
}

module.exports = { getWorkspace, updateWorkspace };
