"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const transporter = nodemailer_1.default.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});
const sendEmail = async (to, subject, text) => {
    console.log(`Attempting to send email to: ${to.join(", ")}`);
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: to.join(", "),
            subject,
            text,
        });
        console.log("Email sent successfully! Message ID: %s", info.messageId);
        return true;
    }
    catch (error) {
        console.error("Error sending email detail:", error);
        return false;
    }
};
exports.sendEmail = sendEmail;
//# sourceMappingURL=emailService.js.map