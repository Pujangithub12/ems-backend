"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AuthController_1 = require("../controllers/AuthController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.post("/login", AuthController_1.AuthController.login);
router.post("/logout", AuthController_1.AuthController.logout);
router.get("/me", auth_1.authMiddleware, AuthController_1.AuthController.getMe);
router.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map