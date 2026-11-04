import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendMail } from "@/lib/mail";
import {
  BCRYPT_ROUNDS,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RESET_LIMITS,
  PASSWORD_RESET_NEUTRAL_MESSAGE,
} from "@/lib/password-policy";

export type PasswordResetResult = { ok: true; message: string } | { ok: false; error: string };

const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";
const RATE_LIMITED = "Too many reset attempts. Please wait a few minutes and try again.";

export const resetPasswordSchema = z.object({
  token: z.string().min(20, { error: INVALID_LINK }),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    })
    .max(200, { error: "Password is too long." }),
  confirm: z.string(),
});

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function throttleHash(kind: "email" | "ip", value: string): string {
  const salt = process.env.AUTH_SECRET?.trim() || "password-reset";
  return createHash("sha256").update(`reset-${kind}:${salt}:${value}`).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** True when this email or IP is over the limit. Records the attempt when it is allowed. */
async function throttlePasswordReset(email: string, ip: string): Promise<boolean> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - PASSWORD_RESET_LIMITS.tokenTtlMs);
  const minuteAgo = new Date(now.getTime() - PASSWORD_RESET_LIMITS.minIntervalMs);
  const ipAgo = new Date(now.getTime() - PASSWORD_RESET_LIMITS.ipWindowMs);
  const emailHash = throttleHash("email", email);
  const ipHash = throttleHash("ip", ip);

  await prisma.passwordResetAttempt.deleteMany({ where: { createdAt: { lt: hourAgo } } });

  const [emailCount, recentForEmail, ipCount] = await Promise.all([
    prisma.passwordResetAttempt.count({ where: { emailHash, createdAt: { gte: hourAgo } } }),
    prisma.passwordResetAttempt.findFirst({
      where: { emailHash, createdAt: { gte: minuteAgo } },
      select: { id: true },
    }),
    prisma.passwordResetAttempt.count({ where: { ipHash, createdAt: { gte: ipAgo } } }),
  ]);

  if (
    recentForEmail ||
    emailCount >= PASSWORD_RESET_LIMITS.maxPerEmailPerHour ||
    ipCount >= PASSWORD_RESET_LIMITS.maxPerIp
  ) {
    return true;
  }

  await prisma.passwordResetAttempt.create({ data: { emailHash, ipHash } });
  return false;
}

export async function createPasswordResetToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_LIMITS.tokenTtlMs);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    }),
  ]);

  return { token, expiresAt };
}

async function sendPasswordResetEmail(to: string, token: string, base: string): Promise<void> {
  const url = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  const href = escapeHtml(url);
  const text = [
    "A password reset was requested for your Unite AV Parts & Production account.",
    "",
    "Choose a new password (this link expires in one hour and works once):",
    url,
    "",
    "If you did not request this, you can ignore this email. Your password will stay the same.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0b0b0b;max-width:560px;margin:0 auto">
    <h2 style="margin:0 0 8px">Reset your password</h2>
    <p style="margin:0 0 16px">A password reset was requested for your Unite AV Parts &amp; Production account.</p>
    <p><a href="${href}" style="display:inline-block;background:#2a78d6;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
    <p style="color:#52514e;font-size:13px">This link expires in one hour and works once. If you did not request it, ignore this email and your password will stay the same.</p>
  </div>`;

  const result = await sendMail({
    to,
    subject: "Reset your Unite AV password",
    html,
    text,
  });
  if (!result.ok) {
    console.error("[password-reset] reset email was not sent.");
  }
}

export async function requestPasswordReset(emailRaw: string, ipRaw: string): Promise<PasswordResetResult> {
  const email = emailRaw.toLowerCase().trim();
  if (!z.email().safeParse(email).success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const ip = ipRaw.trim().slice(0, 64) || "unknown";
  if (await throttlePasswordReset(email, ip)) {
    return { ok: false, error: RATE_LIMITED };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, active: true },
  });

  if (user?.active) {
    const base = appBaseUrl();
    if (!base) {
      console.error("[password-reset] APP_URL or AUTH_URL is not set; reset email was not sent.");
    } else {
      const { token } = await createPasswordResetToken(user.id);
      await sendPasswordResetEmail(user.email, token, base);
    }
  }

  return { ok: true, message: PASSWORD_RESET_NEUTRAL_MESSAGE };
}

export async function resetPasswordWithToken(input: {
  token: string;
  password: string;
  confirm: string;
}): Promise<PasswordResetResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the password and try again." };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { ok: false, error: "Passwords do not match." };
  }

  const tokenHash = hashResetToken(parsed.data.token);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { active: true } },
    },
  });
  const now = new Date();
  if (!row || row.usedAt || row.expiresAt <= now || !row.user.active) {
    return { ok: false, error: INVALID_LINK };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
  let claimed = false;
  try {
    claimed = await prisma.$transaction(async (tx) => {
      const updated = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (updated.count !== 1) return false;
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: now },
      });
      return true;
    });
  } catch {
    console.error("[password-reset] could not update the password.");
    return { ok: false, error: "Could not update the password. Request a new link and try again." };
  }

  if (!claimed) return { ok: false, error: INVALID_LINK };
  return { ok: true, message: "Password updated. You can sign in with the new password." };
}
