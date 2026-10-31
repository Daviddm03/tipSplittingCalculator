const service = require("../services/workspaceService");

async function getWorkspace(req, res, next) {
    try { res.json({ workspace: await service.getWorkspace() }); } catch (error) { next(error); }
}

async function updateWorkspace(req, res, next) {
    try { res.json({ workspace: await service.updateWorkspace(req.body) }); } catch (error) { next(error); }
}

module.exports = { getWorkspace, updateWorkspace };
