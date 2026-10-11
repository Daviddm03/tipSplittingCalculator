const express = require("express");
const outletController = require("../controllers/outletController");

const router = express.Router();

router.get("/", outletController.getOutlets);

module.exports = router;