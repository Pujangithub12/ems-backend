import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const sendEmail = async (
  to: string[],
  subject: string,
  text: string,
  customHtml?: string,
  category: string = "notification",
): Promise<boolean> => {
  const validEmails = to.filter((email) => email && email.trim() !== "");

  if (validEmails.length === 0) {
    console.log("No valid email addresses provided. Skipping email send.");
    return false;
  }

  console.log(`Attempting to send email to ${validEmails.length} recipients.`);

  let successCount = 0;

  const html =
    customHtml ||
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">${subject}</h2>
      <div style="color: #555; line-height: 1.6; white-space: pre-wrap;">${text}</div>
      <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
      <p style="color: #999; font-size: 12px;">
        This email was sent by EMS Management. If you have questions, please contact your administrator.
      </p>
    </div>
  `;

  for (const email of validEmails) {
    try {
      const result = await resend.emails.send({
        from: `EMS Management <${process.env.RESEND_FROM_EMAIL}>`,
        replyTo: process.env.RESEND_FROM_EMAIL!,
        to: [email],
        subject,
        text,
        html,
        headers: {
          "X-Entity-Ref-ID": `ems-${category}-${Date.now()}`,
        },
        tags: [{ name: "category", value: category }],
      });

      if (result.error) {
        console.error(`Failed to send to ${email}:`, result.error);
      } else {
        successCount++;
        console.log(`Sent to ${email}`);
      }
    } catch (err) {
      console.error(`Failed to send to ${email}:`, err);
    }

    // 600ms delay between each send — stays safely under Resend's 2 req/sec limit
    await sleep(600);
  }

  console.log(
    `Email sent to ${successCount}/${validEmails.length} recipients.`,
  );
  return successCount > 0;
};
