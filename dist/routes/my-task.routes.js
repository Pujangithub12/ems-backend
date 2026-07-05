"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const MyTaskController_1 = require("../controllers/MyTaskController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.post("/mytasks", auth_1.authMiddleware, MyTaskController_1.MyTaskController.createMyTask);
router.get("/mytasks", auth_1.authMiddleware, MyTaskController_1.MyTaskController.getMyTasks);
router.put("/mytasks/:id", auth_1.authMiddleware, MyTaskController_1.MyTaskController.updateMyTask);
router.delete("/mytasks/:id", auth_1.authMiddleware, MyTaskController_1.MyTaskController.deleteMyTask);
exports.default = router;
//# sourceMappingURL=my-task.routes.js.map