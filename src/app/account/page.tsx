import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/site/page-shell";
import { buttonClass } from "@/components/ui/button";
import { DeleteAccountForm, DisplayNameForm, SignOutButton } from "./forms";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createSupabaseServerClient();
  const { data: profile } = supabase ? await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle() : { data: null };

  return (
    <PageShell eyebrow="Account" title="Account settings" intro={<p>Signed in as {user.email}</p>}>
      <div className="grid max-w-2xl gap-6">
        <section className="rounded-3xl border border-line bg-ink-900 p-6">
          <h2 className="mb-4 font-medium">Profile</h2>
          <DisplayNameForm name={profile?.display_name ?? ""} />
        </section>
        <section className="rounded-3xl border border-line bg-ink-900 p-6">
          <h2 className="font-medium">Security</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/account/update-password" className={buttonClass("secondary")}>
              Change password
            </Link>
            <SignOutButton />
          </div>
        </section>
        <section className="rounded-3xl border border-line bg-ink-900 p-6">
          <h2 className="font-medium">Your data</h2>
          <p className="mt-2 text-sm text-fg-muted">Download everything we store about you as a JSON file.</p>
          <a href="/account/export" className={buttonClass("secondary", "mt-4")} download>
            Export my data
          </a>
        </section>
        <section className="rounded-3xl border border-danger/30 bg-danger/5 p-6">
          <h2 className="font-medium text-danger">Delete account</h2>
          <p className="mt-2 mb-4 text-sm text-fg-muted">
            This releases your offices, deletes organisations you solely own, and removes your account. It can&apos;t be undone.
          </p>
          <DeleteAccountForm />
        </section>
      </div>
    </PageShell>
  );
}
