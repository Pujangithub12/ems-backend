"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const TaskCommentController_1 = require("../controllers/TaskCommentController");
const auth_1 = require("../middlewares/auth");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
// Task comment routes
router.post("/tasks/:taskId/comments", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.addComment);
router.get("/tasks/:taskId/comments", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.getTaskComments);
router.put("/tasks/:taskId/comments/:commentId/feedback", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), TaskCommentController_1.TaskCommentController.addFeedback);
// Subtask comment routes
router.post("/tasks/:taskId/subtasks/:subtaskId/comments", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.addSubTaskComment);
router.get("/tasks/:taskId/subtasks/:subtaskId/comments", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.getSubTaskComments);
router.put("/tasks/:taskId/subtasks/:subtaskId/comments/:commentId/feedback", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.addSubTaskFeedback);
exports.default = router;
//# sourceMappingURL=task-comment.routes.js.map