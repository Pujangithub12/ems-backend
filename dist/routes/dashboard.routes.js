"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const DashboardController_1 = require("../controllers/DashboardController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.get("/dashboard", auth_1.authMiddleware, DashboardController_1.DashboardController.getDashboard);
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map