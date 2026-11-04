import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password — Unite AV" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
