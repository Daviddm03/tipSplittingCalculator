const express = require("express");
const distributionController = require(
    "../controllers/distributionController"
);

const router = express.Router();

router.get("/", distributionController.getDistributions);

router.get(
    "/:id",
    distributionController.getDistributionById
);

router.post(
    "/",
    distributionController.createDistribution
);

module.exports = router;