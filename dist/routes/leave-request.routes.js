"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const LeaveRequestController_1 = require("../controllers/LeaveRequestController");
const auth_1 = require("../middlewares/auth");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
router.post("/leaverequest", auth_1.authMiddleware, LeaveRequestController_1.LeaveRequestController.createLeaveRequest);
router.get("/leaverequest", auth_1.authMiddleware, LeaveRequestController_1.LeaveRequestController.getAllLeaveRequests);
router.get("/leaverequest/:id", auth_1.authMiddleware, LeaveRequestController_1.LeaveRequestController.getLeaveRequestById);
router.put("/leaverequest/:id/status", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), LeaveRequestController_1.LeaveRequestController.updateStatus);
router.put("/leaverequest/:id", auth_1.authMiddleware, LeaveRequestController_1.LeaveRequestController.updateLeaveRequest);
router.delete("/leaverequest/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), LeaveRequestController_1.LeaveRequestController.deleteLeaveRequest);
exports.default = router;
//# sourceMappingURL=leave-request.routes.js.map