import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMyOrganizations } from "@/lib/data/my-organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { NewAgentForm } from "../forms";

export const metadata: Metadata = { title: "Register an Agent", robots: { index: false } };

export default async function NewAgentPage() {
  const user = await requireUser("/dashboard/agents/new");
  const supabase = await createSupabaseServerClient();
  const mine = supabase ? await getMyOrganizations(supabase, user.id) : [];
  const orgs = mine.filter((m) => (m.role === "owner" || m.role === "admin") && m.offices.length > 0).map((m) => ({ id: m.org.id, name: m.org.name }));

  return (
    <PageShell
      eyebrow="AI agents"
      title="Register an agent"
      intro={
        <p>
          Describe your agent first. Then connect its HTTPS endpoint, test it and publish it.{" "}
          <Link href="/developers#protocol" className="text-cyan-soft hover:underline">
            How agents connect →
          </Link>
        </p>
      }
    >
      {orgs.length === 0 ? (
        <div className="max-w-md space-y-4 rounded-3xl border border-line bg-ink-900 p-6">
          <p className="text-fg-muted">Agents belong to an organisation with an office. Claim a free office first — it takes a minute.</p>
          <ButtonLink href="/city?filter=free">Find a free office</ButtonLink>
        </div>
      ) : (
        <div className="max-w-xl rounded-3xl border border-line bg-ink-900 p-6">
          <NewAgentForm orgs={orgs} />
        </div>
      )}
    </PageShell>
  );
}
