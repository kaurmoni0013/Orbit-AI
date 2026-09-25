import User from "../model/userSchema.js";
import { logError } from "../utils/safeLog.js";

const loadUserMiddleware = async (req, res, next) => {
    try {
        const existingUser = await User.findById(req.userId);

        if (!existingUser) {
            return res.status(404).json({
                message: "User doesn't exist"
            });
        }

        req.user = existingUser;

        next();
    } catch (error) {
        logError("user.load.failed", { requestId: req.requestId }, error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

export default loadUserMiddleware;