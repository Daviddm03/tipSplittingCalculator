const express = require("express");
const locationController = require("../controllers/locationController");

const router = express.Router();

router.get("/", locationController.getLocations);
router.post("/", locationController.createLocation);
router.patch("/:id", locationController.updateLocation);

module.exports = router;
