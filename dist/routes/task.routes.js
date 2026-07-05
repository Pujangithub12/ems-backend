"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const TaskController_1 = require("../controllers/TaskController");
const auth_1 = require("../middlewares/auth");
const upload_1 = require("../middlewares/upload");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
router.post("/tasks", auth_1.authMiddleware, 
// roleMiddleware([UserRole.ADMIN]),
upload_1.upload.array("files"), TaskController_1.TaskController.createTask);
router.get("/tasks", auth_1.authMiddleware, TaskController_1.TaskController.getAllTasks);
router.get("/tasks/:id", auth_1.authMiddleware, TaskController_1.TaskController.getTaskById);
router.put("/tasks/:id/progress", auth_1.authMiddleware, TaskController_1.TaskController.updateTaskProgress);
router.put("/tasks/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), upload_1.upload.array("files"), TaskController_1.TaskController.updateTask);
router.put("/tasks/:id/status", auth_1.authMiddleware, TaskController_1.TaskController.updateTaskStatus);
router.delete("/tasks/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), TaskController_1.TaskController.deleteTask);
exports.default = router;
//# sourceMappingURL=task.routes.js.map