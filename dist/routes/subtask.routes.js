"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SubTaskController_1 = require("../controllers/SubTaskController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.get("/tasks/:taskId/subtasks", auth_1.authMiddleware, SubTaskController_1.SubTaskController.getSubTasks);
router.post("/tasks/:taskId/subtasks", auth_1.authMiddleware, 
// roleMiddleware([UserRole.ADMIN]),
SubTaskController_1.SubTaskController.addSubTask);
router.put("/tasks/:taskId/subtasks/:subtaskId", auth_1.authMiddleware, 
// roleMiddleware([UserRole.ADMIN]),
SubTaskController_1.SubTaskController.updateSubTask);
exports.default = router;
//# sourceMappingURL=subtask.routes.js.map