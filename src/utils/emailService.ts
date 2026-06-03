import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (
  to: string[],
  subject: string,
  text: string,
): Promise<boolean> => {
  const validEmails = to.filter((email) => email && email.trim() !== "");

  if (validEmails.length === 0) {
    console.log("No valid email addresses provided. Skipping email send.");
    return false;
  }

  console.log(`Attempting to send email to ${validEmails.length} recipients.`);

  // Resend allows max 100 recipients per email (to + cc + bcc combined)
  const BATCH_SIZE = 100;
  let successCount = 0;

  try {
    for (let i = 0; i < validEmails.length; i += BATCH_SIZE) {
      const batch = validEmails.slice(i, i + BATCH_SIZE);

      const { data, error } = await resend.emails.send({
        from: `EMS Management <${process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"}>`,
        to: [process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"], // Required by Resend
        bcc: batch,
        subject,
        text,
      });

      if (error) {
        console.error(`Resend batch error (${i}-${i + batch.length}):`, error);
      } else {
        console.log(`Batch sent successfully! Email ID: ${data?.id}`);
        successCount += batch.length;
      }
    }

    console.log(
      `Email sent to ${successCount}/${validEmails.length} recipients.`,
    );
    return successCount > 0;
  } catch (error) {
    console.error("Detailed Email Error:", error);
    return false;
  }
};
