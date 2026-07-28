"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPasswordStrengthError = getPasswordStrengthError;
/**
 * Shared password-strength rule for every "choose a new password" endpoint
 * (register, accept invite, forgot-password reset, change password). Mirrors
 * frontend/src/lib/passwordPolicy.ts — keep both in sync.
 */
function getPasswordStrengthError(password) {
    if (password.length < 8) {
        return "Password must be at least 8 characters long.";
    }
    if (!/[A-Z]/.test(password)) {
        return "Password must contain at least one capital letter.";
    }
    if (!/[0-9]/.test(password)) {
        return "Password must contain at least one number.";
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return "Password must contain at least one special character.";
    }
    return null;
}
//# sourceMappingURL=passwordPolicy.js.map