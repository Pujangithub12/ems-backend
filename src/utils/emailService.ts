import nodemailer from "nodemailer";
import dns from "dns";
import dotenv from "dotenv";

dotenv.config();

// Force IPv4 lookup to avoid ENETUNREACH/Timeout issues on Render
const ipv4DnsLookup = (hostname: string, options: any, callback: any) => {
  // Explicitly request only IPv4 addresses
  dns.lookup(hostname, { family: 4 }, (err, address) => {
    if (err) return callback(err);
    callback(null, address, 4);
  });
};

// Use Port 465 with secure: true for a direct SSL connection
const smtpOptions: any = {
  host: process.env.EMAIL_HOST,
  port: 465,
  secure: true, // true for 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS?.replace(/\s+/g, ""),
  },
  // Apply the IPv4 lookup fix
  dnsLookup: ipv4DnsLookup,
  // Add a timeout to fail faster if it's still blocked
  connectionTimeout: 10000,
};

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
  const validEmails = to.filter((email) => email && email.trim() !== "");

  if (validEmails.length === 0) {
    console.log("No valid email addresses provided. Skipping email send.");
    return false;
  }

  console.log(`Attempting to send email to ${validEmails.length} recipients.`);
  console.log(`Using EMAIL_USER: ${process.env.EMAIL_USER}`);

  try {
    const info = await transporter.sendMail({
      from: `"EMS Management" <${process.env.EMAIL_FROM}>`,
      to: process.env.EMAIL_USER,
      bcc: validEmails.join(", "),
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
