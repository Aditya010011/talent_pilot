import "server-only";
import nodemailer from "nodemailer";

// SMTP credentials from environment variables only — never hardcoded
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || "465");
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.warn(
    "[email] SMTP configuration incomplete — email sending will fail at runtime",
  );
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/**
 * Send a single email. Returns the messageId on success.
 * Throws on failure — caller should handle errors.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ messageId: string }> {
  // Basic email validation
  if (!opts.to || !opts.to.includes("@")) {
    throw new Error("Invalid recipient email address");
  }
  if (!opts.subject?.trim()) {
    throw new Error("Email subject is required");
  }

  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo || undefined,
  });

  return { messageId: info.messageId };
}

/**
 * Build the invite email HTML from a template + variables.
 * Template variables are replaced safely (text content only, no script injection).
 */
export function renderInviteEmail(
  template: {
    subject: string;
    body: string;
    logoUrl?: string | null;
  },
  variables: {
    candidateName: string;
    inviteLink: string;
    interviewTitle: string;
    interviewDescription?: string;
    companyName?: string;
    validityPeriod?: string;
  },
): { subject: string; html: string } {
  // Safe text replacement — variables are text-only, no HTML injection possible
  // because they are placed in text nodes within the wrapper template
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const replaceVars = (text: string) =>
    text
      .replace(/\{\{candidate_name\}\}/gi, escapeHtml(variables.candidateName))
      .replace(/\{\{invite_link\}\}/gi, escapeHtml(variables.inviteLink))
      .replace(/\{\{interview_title\}\}/gi, escapeHtml(variables.interviewTitle))
      .replace(
        /\{\{interview_description\}\}/gi,
        escapeHtml(variables.interviewDescription || ""),
      )
      .replace(
        /\{\{company_name\}\}/gi,
        escapeHtml(variables.companyName || "Inluwa"),
      )
      .replace(
        /\{\{validity_period\}\}/gi,
        escapeHtml(variables.validityPeriod || ""),
      );

  const subject = replaceVars(template.subject);

  // If user provided custom body, use it with variable replacement
  // Otherwise use the default template
  const bodyContent = template.body
    ? `<div style="color:#555;font-size:15px;line-height:1.6;">${replaceVars(template.body).replace(/\n/g, '<br />')}</div>`
    : buildDefaultBody(variables, template.logoUrl);

  const html = wrapInEmailLayout(bodyContent, template.logoUrl);

  return { subject, html };
}

function buildDefaultBody(
  variables: {
    candidateName: string;
    inviteLink: string;
    interviewTitle: string;
    interviewDescription?: string;
    companyName?: string;
    validityPeriod?: string;
  },
  logoUrl?: string | null,
): string {
  const name = variables.candidateName || "there";
  const desc = variables.interviewDescription
    ? `<p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px">${variables.interviewDescription.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
    : "";

  return `
    <h1 style="color:#1a1a1a;font-size:22px;font-weight:600;margin:0 0 8px">You're Invited</h1>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px">
      Hi ${name.replace(/</g, "&lt;").replace(/>/g, "&gt;")},
    </p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 8px">
      You've been invited to participate in an interview:
    </p>
    <p style="color:#1a1a1a;font-size:17px;font-weight:600;margin:0 0 16px">
      ${variables.interviewTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
    </p>
    ${desc}
    ${variables.validityPeriod ? `<p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px"><strong>Available:</strong> ${variables.validityPeriod}</p>` : ''}
    <div style="text-align:center;margin:32px 0">
      <a href="${variables.inviteLink.replace(/"/g, "&quot;")}"
         style="background:#1a1a1a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block"
         target="_blank">
        Start Interview
      </a>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:24px 0 0">
      If the button doesn't work, copy and paste this link:<br>
      <a href="${variables.inviteLink.replace(/"/g, "&quot;")}" style="color:#1a1a1a;word-break:break-all">${variables.inviteLink.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a>
    </p>
  `;
}

function wrapInEmailLayout(
  bodyContent: string,
  logoUrl?: string | null,
): string {
  const logoHtml = logoUrl
    ? `<img src="${logoUrl.replace(/"/g, "&quot;")}" alt="Logo" style="max-height:48px;max-width:200px;margin-bottom:24px" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Interview Invitation</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <tr>
            <td style="padding:40px 40px 32px;text-align:center">
              ${logoHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eee;text-align:center">
              <p style="color:#aaa;font-size:12px;margin:0">
                Powered by Inluwa
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

