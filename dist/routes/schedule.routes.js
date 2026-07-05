"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ScheduleController_1 = require("../controllers/ScheduleController");
const schedule_service_1 = require("../services/schedule.service");
const auth_1 = require("../middlewares/auth");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
const scheduleController = new ScheduleController_1.ScheduleController(new schedule_service_1.ScheduleService());
// Project schedule (Gantt) routes — full replace on save
router.get("/projects/:projectId/schedule", auth_1.authMiddleware, scheduleController.getSchedule);
router.put("/projects/:projectId/schedule", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), scheduleController.saveSchedule);
exports.default = router;
//# sourceMappingURL=schedule.routes.js.map