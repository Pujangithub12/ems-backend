"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const WorkspaceController_1 = require("../controllers/WorkspaceController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.get("/workspaces", auth_1.authMiddleware, WorkspaceController_1.WorkspaceController.getAll);
router.post("/workspaces", auth_1.authMiddleware, WorkspaceController_1.WorkspaceController.create);
router.post("/workspaces/switch", auth_1.authMiddleware, WorkspaceController_1.WorkspaceController.switch);
router.get("/workspaces/current", auth_1.authMiddleware, WorkspaceController_1.WorkspaceController.getCurrent);
router.put("/workspaces/:id", auth_1.authMiddleware, WorkspaceController_1.WorkspaceController.update);
router.delete("/workspaces/:id", auth_1.authMiddleware, WorkspaceController_1.WorkspaceController.remove);
exports.default = router;
//# sourceMappingURL=workspace.routes.js.map