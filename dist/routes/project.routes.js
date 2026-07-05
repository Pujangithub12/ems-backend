"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ProjectController_1 = require("../controllers/ProjectController");
const TaskController_1 = require("../controllers/TaskController");
const auth_1 = require("../middlewares/auth");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
router.post("/projects", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectController_1.ProjectController.createProject);
router.get("/projects", auth_1.authMiddleware, ProjectController_1.ProjectController.getAllProjects);
router.get("/projects/:id", auth_1.authMiddleware, ProjectController_1.ProjectController.getProjectById);
router.put("/projects/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectController_1.ProjectController.updateProject);
router.delete("/projects/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectController_1.ProjectController.deleteProject);
// Project task routes
router.post("/projects/:projectId/tasks", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectController_1.ProjectController.addProjectTask);
router.put("/projects/tasks/:taskId", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectController_1.ProjectController.updateProjectTask);
router.delete("/projects/tasks/:taskId", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectController_1.ProjectController.deleteProjectTask);
router.get("/projects/:projectId/tasks", auth_1.authMiddleware, TaskController_1.TaskController.getTasksByProject);
// Project heading routes
router.post("/projects/:projectId/headings", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectController_1.ProjectController.addProjectHeading);
exports.default = router;
//# sourceMappingURL=project.routes.js.map