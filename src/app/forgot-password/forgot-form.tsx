"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/lib/password-reset-actions";
import { AuthScreen } from "@/components/AuthScreen";
import { btnPrimary, input } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, null);

  return (
    <AuthScreen title="Forgot password" subtitle="Enter the email on your account.">
      <form action={formAction} className="space-y-3 rounded-xl border bg-surface p-5">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-2">
            Email
          </label>
          <input
            id="email"
            name="email"
            className={input}
            type="email"
            autoComplete="email"
            spellCheck={false}
            required
          />
        </div>
        {state?.ok === false && (
          <p className="text-sm text-critical" role="alert">
            {state.error}
          </p>
        )}
        {state?.ok === true && (
          <p className="text-sm text-good" role="status">
            {state.message}
          </p>
        )}
        <button className={`${btnPrimary} w-full`} disabled={pending}>
          {pending ? "Sending…" : "Email reset link"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthScreen>
  );
}
