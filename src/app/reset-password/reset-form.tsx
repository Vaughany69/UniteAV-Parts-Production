"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/lib/password-reset-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { AuthScreen } from "@/components/AuthScreen";
import { btnPrimary, input } from "@/components/ui";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);

  if (!token) {
    return (
      <AuthScreen title="Choose a new password" subtitle="This reset link is missing its token.">
        <div className="rounded-xl border bg-surface p-5 text-sm text-ink-2">
          <p>Open the link from the reset email, or request a new one.</p>
          <p className="mt-4">
            <Link href="/forgot-password" className="font-medium text-brand hover:underline">
              Request a new link
            </Link>
          </p>
        </div>
      </AuthScreen>
    );
  }

  if (state?.ok === true) {
    return (
      <AuthScreen title="Password updated" subtitle={state.message}>
        <div className="rounded-xl border bg-surface p-5 text-center">
          <Link href="/login" className={`${btnPrimary} w-full`}>
            Sign in
          </Link>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Choose a new password" subtitle={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
      <form action={formAction} className="space-y-3 rounded-xl border bg-surface p-5">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink-2">
            New password
          </label>
          <input
            id="password"
            name="password"
            className={input}
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-xs font-medium text-ink-2">
            Confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            className={input}
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>
        {state?.ok === false && (
          <p className="text-sm text-critical" role="alert">
            {state.error}
          </p>
        )}
        <button className={`${btnPrimary} w-full`} disabled={pending}>
          {pending ? "Saving…" : "Update password"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-brand hover:underline">
          Request a new link
        </Link>
      </p>
    </AuthScreen>
  );
}
