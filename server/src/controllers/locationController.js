const service = require("../services/locationService");

async function getLocations(req, res, next) {
    try {
        res.json({ locations: await service.getLocations() });
    } catch (error) {
        next(error);
    }
}

async function createLocation(req, res, next) {
    try { res.status(201).json({ location: await service.createLocation(req.body) }); } catch (error) { next(error); }
}

async function updateLocation(req, res, next) {
    try { res.json({ location: await service.updateLocation(req.params.id, req.body) }); } catch (error) { next(error); }
}

module.exports = {
    getLocations,
    createLocation,
    updateLocation
};
