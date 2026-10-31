import { Resend } from "resend";
import dotenv from "dotenv";
import logger from "../logger.js";

dotenv.config();

const apiKey = process.env.RESEND_API || "";
const resend = apiKey ? new Resend(apiKey) : null;

export const sendEmail = async (
  to: string,
  subject: string,
  body: string
) => {
  const fromAddress = process.env.EMAIL_FROM || "NetraVaani <noreply@kamaljoshi-ai.xyz>";

  if (!resend) {
    logger.warn("RESEND_API key not found. Email not sent via network.", { to, subject });
    return { success: false, reason: "NO_RESEND_API" };
  }

  try {
    const data = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html: body,
    });
    return data;
  } catch (err: any) {
    logger.error("Resend email dispatch error", { error: err.message, to, subject });
    throw err;
  }
};

export const sendVerificationToEmail = async (to: string, token: string) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const verificationUrl = `${frontendUrl}/verify-email/${token}`;

  const html = `
  <div style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; padding:40px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
            
            <tr>
              <td align="center">
                <h1 style="margin:0; color:#111827; font-size:26px;">
                  Welcome to NetraVaani
                </h1>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 0; color:#4b5563; font-size:16px; text-align:center;">
                Thank you for signing up!  
                Please confirm your email address by clicking the button below.
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:20px 0;">
                <a href="${verificationUrl}" 
                   style="
                     background-color:#4f46e5;
                     color:#ffffff;
                     padding:12px 24px;
                     text-decoration:none;
                     border-radius:6px;
                     font-size:16px;
                     font-weight:bold;
                     display:inline-block;
                   ">
                  Verify Email 
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding-top:20px; font-size:14px; color:#6b7280; text-align:center;">
                This link will expire in 24 hours.
              </td>
            </tr>

            <tr>
              <td style="padding-top:10px; font-size:12px; color:#9ca3af; text-align:center;">
                If you did not create an account, you can safely ignore this email.
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
`;

  await sendEmail(to, "Verify Your NetraVaani Account", html);
};
