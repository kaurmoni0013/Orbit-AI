export const notFoundHandler = (req, res) => {
    res.status(404).json({
        message: `Route not found: ${req.method} ${req.baseUrl}${req.path}`,
    });
};

export const errorHandler = (error, req, res, next) => {
    if (res.headersSent) return next(error);

    console.error(JSON.stringify({
        event: "http.error",
        requestId: req.requestId,
        error: error?.name || "UnknownError",
        status: error.statusCode || 500,
    }));

    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "Invalid JSON request body" });
    }
    if (error.message === "Origin is not allowed by CORS") {
        return res.status(403).json({ message: "Origin is not allowed" });
    }

    return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Internal server error",
    });
};
