import { Resend } from "resend";

export type MailResult = { ok: true; dryRun: boolean } | { ok: false; dryRun: boolean; error: string };

/** Public origin for links in email. APP_URL wins; AUTH_URL is the fallback. */
export function appBaseUrl(): string | null {
  const configured = (process.env.APP_URL || process.env.AUTH_URL || "").trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      const path = url.pathname.replace(/\/$/, "");
      return `${url.origin}${path === "/" ? "" : path}`;
    } catch {
      return null;
    }
  }
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return null;
}

export function mailFromAddress(): string {
  return process.env.MAIL_FROM?.trim() || process.env.RESEND_FROM?.trim() || "";
}

/** Hide reset tokens (and anything else sitting in a token query param). */
export function redactSecrets(text: string): string {
  return text.replace(/([?&]token=)[^&\s"'<>]+/gi, "$1[redacted]");
}

function dryRunBody(text: string): string {
  return process.env.NODE_ENV === "development" ? text : redactSecrets(text);
}

/**
 * Send one message with Resend.
 * With no RESEND_API_KEY this logs a dry run and does not call the network.
 * The full reset link is included in that log only when NODE_ENV is development.
 */
export async function sendMail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = mailFromAddress();

  if (!key) {
    console.info(
      `[mail:dry-run] RESEND_API_KEY is not set; email was not sent. to=${args.to} from=${from || "(MAIL_FROM unset)"} subject=${args.subject}\n${dryRunBody(args.text)}`,
    );
    return { ok: true, dryRun: true };
  }

  if (!from) {
    console.error("[mail] RESEND_API_KEY is set but MAIL_FROM is not. Email was not sent.");
    return { ok: false, dryRun: false, error: "MAIL_FROM is not set." };
  }

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) {
      console.error(`[mail] Resend rejected the email (${error.name}).`);
      return { ok: false, dryRun: false, error: "Email could not be sent." };
    }
    return { ok: true, dryRun: false };
  } catch {
    console.error("[mail] Resend request failed.");
    return { ok: false, dryRun: false, error: "Email could not be sent." };
  }
}
