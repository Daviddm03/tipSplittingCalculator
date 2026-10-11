const outletRepository = require("../repositories/outletRepository");

async function getOutlets(req, res) {
    try {
        const outlets = await outletRepository.findAll();

        res.status(200).json(outlets);
    } catch (error) {
        console.error("Failed to fetch outlets:", error.message);

        res.status(500).json({
            error: "Failed to fetch outlets"
        });
    }
}

module.exports = {
    getOutlets
};