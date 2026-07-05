"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const HierarchyController_1 = require("../controllers/HierarchyController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.get("/hierarchy", auth_1.authMiddleware, HierarchyController_1.HierarchyController.getHierarchy);
router.put("/hierarchy", auth_1.authMiddleware, HierarchyController_1.HierarchyController.saveHierarchy);
exports.default = router;
//# sourceMappingURL=hierarchy.routes.js.map