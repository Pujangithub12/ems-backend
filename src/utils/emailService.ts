import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

export const sendEmail = async (to: string[], subject: string, text: string) => {
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
    } catch (error) {
        console.error("Error sending email detail:", error);
        return false;
    }
};
