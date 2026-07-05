"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AnnouncementController_1 = require("../controllers/AnnouncementController");
const auth_1 = require("../middlewares/auth");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
// Admin only for creating and deleting
router.post("/announcements", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), AnnouncementController_1.AnnouncementController.createAnnouncement);
router.get("/announcements", auth_1.authMiddleware, AnnouncementController_1.AnnouncementController.getHistory);
router.delete("/announcements/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), AnnouncementController_1.AnnouncementController.deleteAnnouncement);
exports.default = router;
//# sourceMappingURL=announcement.routes.js.map