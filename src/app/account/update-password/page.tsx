import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { UpdatePasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "New Password", robots: { index: false } };

export default async function UpdatePasswordPage() {
  await requireUser("/account/update-password");
  return (
    <AuthCard title="Choose a new password">
      <UpdatePasswordForm />
    </AuthCard>
  );
}
