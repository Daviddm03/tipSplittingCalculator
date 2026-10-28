const router = require("express").Router();
const controller = require("../controllers/workspaceController");

router.get("/", controller.getWorkspace);
router.patch("/", controller.updateWorkspace);

module.exports = router;
