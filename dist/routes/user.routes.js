"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserController_1 = require("../controllers/UserController");
const auth_1 = require("../middlewares/auth");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
// Admin only for adding and deleting users
router.post("/users", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), UserController_1.UserController.addUser);
router.get("/users", auth_1.authMiddleware, UserController_1.UserController.getAllUsers);
router.delete("/users/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), UserController_1.UserController.deleteUser);
router.put("/users/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), UserController_1.UserController.updateUser);
exports.default = router;
//# sourceMappingURL=user.routes.js.map