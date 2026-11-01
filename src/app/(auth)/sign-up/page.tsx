import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Create Account", robots: { index: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthCard
      title="Claim your place on Second Wall Street"
      subtitle="Free account. Free office. No credit card."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="text-cyan-soft hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthCard>
  );
}
