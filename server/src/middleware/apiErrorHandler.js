const { ApiError } = require("../services/settingsValidation");

function apiErrorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message, code: error.code });
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "A valid JSON object is required.", code: "INVALID_BODY" });
    if (error.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large.", code: "INVALID_BODY" });
    const unavailable = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "57P02", "57P03", "53300", "08000", "08001", "08003", "08004", "08006"].includes(error.code);
    return res.status(unavailable ? 503 : 500).json({
        error: unavailable ? "The database is temporarily unavailable." : "The request could not be completed.",
        code: unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR"
    });
}

module.exports = apiErrorHandler;
