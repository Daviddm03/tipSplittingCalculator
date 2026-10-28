const service = require("../services/distributionService");

async function getDistributions(req, res, next) {
    try {
        return res.json({ distributions: await service.getDistributions() });
    } catch (error) {
        return next(error);
    }
}

async function getDistributionById(req, res, next) {
    try {
        return res.json(await service.getDistributionById(req.params.id));
    } catch (error) {
        return next(error);
    }
}

async function previewDistribution(req, res, next) {
    try {
        return res.json(await service.previewDistribution(req.body));
    } catch (error) {
        return next(error);
    }
}

async function createDistribution(req, res, next) {
    try {
        return res.status(201).json(await service.confirmDistribution(req.body));
    } catch (error) {
        return next(error);
    }
}

module.exports = { getDistributions, getDistributionById, previewDistribution, createDistribution };
