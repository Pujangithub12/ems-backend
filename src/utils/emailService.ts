import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail", // Use service: 'gmail' for better compatibility
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS?.replace(/\s/g, ""), // Remove spaces from app password
  },
});

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP Connection Error:", error);
  } else {
    console.log("SMTP Server is ready to take our messages");
  }
});

export const sendEmail = async (
  to: string[],
  subject: string,
  text: string,
) => {
  console.log(`Attempting to send email to: ${to.join(", ")}`);
  console.log(`Using EMAIL_USER: ${process.env.EMAIL_USER}`);

  try {
    const info = await transporter.sendMail({
      from: `"EMS Management" <${process.env.EMAIL_FROM}>`,
      to: to.join(", "),
      subject,
      text,
    });
    console.log("Email sent successfully! Message ID: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Detailed Email Error:", error);
    return false;
  }
};
