import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMyOrganizations } from "@/lib/data/my-organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { LogoForm, OrganizationForm } from "../forms";

export const metadata: Metadata = { title: "Edit Organisation", robots: { index: false } };

export default async function EditOrganizationPage() {
  const user = await requireUser("/dashboard/organization");
  const supabase = await createSupabaseServerClient();
  const mine = supabase ? await getMyOrganizations(supabase, user.id) : [];
  const editable = mine.find((m) => m.role === "owner" || m.role === "admin");

  if (!editable) {
    return (
      <PageShell eyebrow="Organisation" title="No organisation yet" intro={<p>Your organisation is created when you claim your first office.</p>}>
        <ButtonLink href="/city?filter=free">Find a free office</ButtonLink>
      </PageShell>
    );
  }
  const { org } = editable;
  return (
    <PageShell
      eyebrow="Organisation"
      title={`Edit ${org.name}`}
      intro={
        <p>
          Shown on your public page at{" "}
          <Link href={`/orgs/${org.slug}`} className="text-cyan-soft hover:underline">
            /orgs/{org.slug}
          </Link>{" "}
          and in the city.
        </p>
      }
    >
      <div className="grid max-w-3xl gap-6">
        <section className="rounded-3xl border border-line bg-ink-900 p-6">
          <LogoForm org={org} />
        </section>
        <section className="rounded-3xl border border-line bg-ink-900 p-6">
          <OrganizationForm org={org} />
        </section>
      </div>
    </PageShell>
  );
}
