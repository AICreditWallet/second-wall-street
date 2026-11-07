import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/billing/plans";
import { stripeMode } from "@/lib/billing/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { AdminPeople } from "./people";
import { moderateReview, resolveReport, suspendAgent } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

function ActionButton({
  action,
  fields,
  children,
  danger,
}: {
  action: (f: FormData) => Promise<void>;
  fields: Record<string, string>;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className={`min-h-9 rounded-full border px-3 text-xs ${danger ? "border-danger/50 text-danger hover:bg-danger/10" : "border-line hover:bg-white/5"}`}
      >
        {children}
      </button>
    </form>
  );
}

/** Staff-only overview: revenue, moderation queue, reviews and the audit log. 404 for everyone else. */
export default async function AdminPage() {
  await requireUser("/admin");
  const supabase = await createSupabaseServerClient();
  const { data: isMod } = supabase
    ? await supabase.rpc("is_moderator")
    : { data: false };
  if (!isMod) notFound();
  const { data: isAdmin } = await supabase!.rpc("is_admin");
  // Reads run as the signed-in staff member: row-level security lets admins see
  // all purchases and the audit log, and moderators see reports and hidden reviews.
  // No service-role key is needed on this page.
  const db = supabase!;
  const none = Promise.resolve({ data: [] as never[], error: null });
  const [purchases, reports, reviews, audit] = await Promise.all([
    isAdmin
      ? db
          .from("office_purchases")
          .select(
            "id, office_id, kind, status, amount_minor, currency, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(200)
      : none,
    db
      .from("moderation_reports")
      .select("id, target_type, target_id, reason, status, created_at")
      .in("status", ["open", "reviewing"])
      .order("created_at")
      .limit(50),
    db
      .from("reviews")
      .select("id, agent_id, organization_id, rating, body, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    isAdmin
      ? db
          .from("audit_logs")
          .select("id, action, target_type, target_id, created_at")
          .order("created_at", { ascending: false })
          .limit(30)
      : none,
  ]);
  const failed = [purchases, reports, reviews, audit].find((r) => r.error);
  if (failed?.error) console.error("admin_read_failed", failed.error.message);
  const p = purchases.data ?? [];
  const activeMonthly = p.filter(
    (x) =>
      x.kind === "monthly" &&
      (x.status === "active" || x.status === "past_due"),
  );
  const lifetime = p.filter(
    (x) => x.kind === "lifetime" && x.status === "active",
  );
  const conflicts = p.filter((x) => x.status === "conflict");
  const stats = [
    ["Monthly subscriptions", String(activeMonthly.length)],
    [
      "Monthly recurring revenue",
      formatMoney(
        activeMonthly.reduce((a, x) => a + x.amount_minor, 0),
        "gbp",
      ),
    ],
    [
      "One-time offices sold",
      `${lifetime.length} · ${formatMoney(
        lifetime.reduce((a, x) => a + x.amount_minor, 0),
        "gbp",
      )}`,
    ],
    [
      "Payment problems",
      String(
        activeMonthly.filter((x) => x.status === "past_due").length +
          conflicts.length,
      ),
    ],
  ];

  return (
    <PageShell eyebrow="Staff" title="Admin">
      {isAdmin && (
        <section aria-labelledby="rev-h">
          <h2
            id="rev-h"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            Revenue{" "}
            {stripeMode && (
              <Badge tone={stripeMode === "test" ? "gold" : "cyan"}>
                {stripeMode === "test" ? "Stripe test mode" : "Live"}
              </Badge>
            )}
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map(([k, v]) => (
              <div
                key={k}
                className="rounded-2xl border border-line bg-ink-900 p-4"
              >
                <dt className="text-xs text-fg-subtle">{k}</dt>
                <dd className="mt-1 text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {conflicts.length > 0 && (
            <p className="mt-3 text-sm text-danger">
              {conflicts.length} payment(s) arrived after the office went to
              someone else and were refunded or cancelled automatically:{" "}
              {conflicts.map((c) => c.id.slice(0, 8)).join(", ")}. Check them in
              Stripe.
            </p>
          )}
        </section>
      )}

      {isAdmin && <AdminPeople db={db} />}

      <section aria-labelledby="rep-h" className="mt-12">
        <h2 id="rep-h" className="text-lg font-semibold">
          Reports ({reports.data?.length ?? 0} open)
        </h2>
        {!reports.data?.length ? (
          <p className="mt-2 text-sm text-fg-muted">Nothing to review.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reports.data.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-line bg-ink-900 p-4 text-sm"
              >
                <p className="text-xs text-fg-subtle">
                  {r.target_type} · {r.target_id} ·{" "}
                  {when.format(new Date(r.created_at))} · {r.status}
                </p>
                <p className="mt-1">{r.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    action={resolveReport}
                    fields={{ id: r.id, status: "actioned" }}
                  >
                    Mark actioned
                  </ActionButton>
                  <ActionButton
                    action={resolveReport}
                    fields={{ id: r.id, status: "dismissed" }}
                  >
                    Dismiss
                  </ActionButton>
                  {r.target_type === "review" && (
                    <ActionButton
                      action={moderateReview}
                      fields={{ id: r.target_id, status: "hidden" }}
                      danger
                    >
                      Hide review
                    </ActionButton>
                  )}
                  {r.target_type === "agent" && isAdmin && (
                    <ActionButton
                      action={suspendAgent}
                      fields={{ id: r.target_id, suspend: "1" }}
                      danger
                    >
                      Suspend agent
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="revw-h" className="mt-12">
        <h2 id="revw-h" className="text-lg font-semibold">
          Latest reviews
        </h2>
        <ul className="mt-4 space-y-2">
          {(reviews.data ?? []).map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-ink-900 p-4 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="text-xs text-fg-subtle">
                  {r.agent_id ?? `org ${r.organization_id}`} · {r.rating}★ ·{" "}
                  {when.format(new Date(r.created_at))}
                </span>
                <span className="block">{r.body}</span>
              </span>
              <ActionButton
                action={moderateReview}
                fields={{
                  id: r.id,
                  status: r.status === "hidden" ? "published" : "hidden",
                }}
                danger={r.status !== "hidden"}
              >
                {r.status === "hidden" ? "Restore" : "Hide"}
              </ActionButton>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && (
        <section aria-labelledby="audit-h" className="mt-12">
          <h2 id="audit-h" className="text-lg font-semibold">
            Audit log
          </h2>
          <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-ink-900 font-mono text-xs">
            {(audit.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-4 px-4 py-2">
                <time className="text-fg-subtle">
                  {when.format(new Date(a.created_at))}
                </time>
                <span className="text-cyan-soft">{a.action}</span>
                <span className="text-fg-muted">
                  {a.target_type} {a.target_id}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </PageShell>
  );
}
