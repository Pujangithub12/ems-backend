"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const CalendarEventController_1 = require("../controllers/CalendarEventController");
const auth_1 = require("../middlewares/auth");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
router.get("/events", auth_1.authMiddleware, CalendarEventController_1.CalendarEventController.getAllEvents);
router.post("/events", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), CalendarEventController_1.CalendarEventController.createEvent);
router.delete("/events/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), CalendarEventController_1.CalendarEventController.deleteEvent);
exports.default = router;
//# sourceMappingURL=calendar-event.routes.js.map