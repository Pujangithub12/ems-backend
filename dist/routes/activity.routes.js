"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ActivityController_1 = require("../controllers/ActivityController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.get("/activities", auth_1.authMiddleware, ActivityController_1.ActivityController.getAllActivities);
exports.default = router;
//# sourceMappingURL=activity.routes.js.map