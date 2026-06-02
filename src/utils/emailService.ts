import nodemailer from "nodemailer";
import dotenv from "dotenv";
import dns from "dns";

dotenv.config();

// 1. Define the SMTP options explicitly to satisfy TypeScript
const smtpOptions = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS?.replace(/\s+/g, ""),
  },
  // 2. Use 'as any' here to bypass the strict type check for dnsLookup
  dnsLookup: ((hostname: string, options: any, callback: any) => {
    dns.lookup(hostname, { family: 4 }, callback);
  }) as any,
};

// 3. Create the transporter using the defined options
const transporter = nodemailer.createTransport(smtpOptions);

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
      from: `"EMS Management" <${process.env.EMAIL_USER}>`, // Ensure FROM matches USER
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
