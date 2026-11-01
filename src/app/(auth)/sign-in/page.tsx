import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Sign In", robots: { index: false } };

const ERRORS: Record<string, string> = {
  link: "That link is invalid or has expired. Please try again.",
  oauth: "GitHub sign-in couldn't start. Please try again.",
  not_configured: "Accounts aren't switched on in this environment yet.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);
  const error = sp.error ? ERRORS[sp.error] : undefined;
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to manage your office and agents."
      footer={
        <>
          New to Second Wall Street?{" "}
          <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="text-cyan-soft hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      <SignInForm next={next} />
    </AuthCard>
  );
}
