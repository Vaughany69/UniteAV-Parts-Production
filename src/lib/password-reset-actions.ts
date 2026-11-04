"use server";

import { headers } from "next/headers";
import { requestPasswordReset, resetPasswordWithToken, type PasswordResetResult } from "@/lib/password-reset";

function clientIp(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerList.get("x-real-ip")?.trim() || "unknown";
}

export async function forgotPasswordAction(
  _prev: PasswordResetResult | null,
  formData: FormData,
): Promise<PasswordResetResult> {
  const email = String(formData.get("email") ?? "");
  const ip = clientIp(await headers());
  return requestPasswordReset(email, ip);
}

export async function resetPasswordAction(
  _prev: PasswordResetResult | null,
  formData: FormData,
): Promise<PasswordResetResult> {
  return resetPasswordWithToken({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
}
