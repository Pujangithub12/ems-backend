"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ProjectFileController_1 = require("../controllers/ProjectFileController");
const auth_1 = require("../middlewares/auth");
const upload_1 = require("../middlewares/upload");
const User_1 = require("../entities/User");
const router = (0, express_1.Router)();
// Project file routes (Documents tab)
router.get("/projects/:projectId/files", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.getProjectFiles);
router.post("/projects/:projectId/folders", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectFileController_1.ProjectFileController.addProjectFolder);
router.post("/projects/:projectId/files", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), upload_1.uploadProjectFile.single("file"), ProjectFileController_1.ProjectFileController.addProjectFile);
router.get("/projects/files/:fileId/download", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.downloadProjectFile);
router.put("/projects/files/:fileId", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectFileController_1.ProjectFileController.renameProjectFile);
router.delete("/projects/files/:fileId", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([User_1.UserRole.ADMIN]), ProjectFileController_1.ProjectFileController.deleteProjectFile);
exports.default = router;
//# sourceMappingURL=project-file.routes.js.map