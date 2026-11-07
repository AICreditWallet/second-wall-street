import type { SupabaseClient } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { setContactStatus } from "./actions";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

type UserRow = { id: string; email: string | null; email_confirmed: boolean; display_name: string | null; github_username: string | null; organization: string | null; joined_at: string; last_sign_in_at: string | null };
type MessageRow = { id: string; email: string; email_verified: boolean; subject: string; message: string; status: "new" | "handled"; created_at: string };

/** Admin only: messages from the contact page and the list of accounts. The database re-checks the role on both. */
export async function AdminPeople({ db }: { db: SupabaseClient }) {
  const [users, messages] = await Promise.all([
    db.rpc("admin_list_users", { p_limit: 200 }),
    db.from("contact_messages").select("id, email, email_verified, subject, message, status, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (users.error || messages.error) {
    console.error("admin_people_failed", users.error?.message, messages.error?.message);
    return <p className="mt-12 text-sm text-danger">Users and messages couldn&apos;t be loaded. If this is new, the latest database migration may not have been run yet.</p>;
  }
  const people = (users.data ?? []) as UserRow[];
  const inbox = (messages.data ?? []) as MessageRow[];
  const fresh = inbox.filter((m) => m.status === "new").length;

  return (
    <>
      <section aria-labelledby="inbox-h" className="mt-12">
        <h2 id="inbox-h" className="text-lg font-semibold">
          Messages ({fresh} new)
        </h2>
        {inbox.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">No messages yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {inbox.map((m) => (
              <li key={m.id} className={`rounded-2xl border bg-ink-900 p-4 text-sm ${m.status === "new" ? "border-cyan/40" : "border-line"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{m.subject}</p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      <a href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="break-all text-cyan-soft underline">
                        {m.email}
                      </a>{" "}
                      · {when.format(new Date(m.created_at))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Anyone can type any address into the form, so don't assume it's really them. */}
                    <Badge tone={m.email_verified ? "cyan" : "gold"}>{m.email_verified ? "Their account email" : "Email not verified"}</Badge>
                    <form action={setContactStatus}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="status" value={m.status === "new" ? "handled" : "new"} />
                      <button type="submit" className="min-h-9 rounded-full border border-line px-3 text-xs hover:bg-white/5">
                        {m.status === "new" ? "Mark handled" : "Reopen"}
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-fg-muted">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="users-h" className="mt-12">
        <h2 id="users-h" className="text-lg font-semibold">
          Users ({people.length}
          {people.length === 200 ? ", newest 200" : ""})
        </h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Accounts, newest first</caption>
            <thead className="bg-ink-900 text-xs text-fg-subtle">
              <tr>
                {["Email", "Name", "GitHub", "Organisation", "Joined", "Last sign-in"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2.5">
                    {u.email ? (
                      <a href={`mailto:${encodeURIComponent(u.email)}`} className="break-all text-cyan-soft underline">
                        {u.email}
                      </a>
                    ) : (
                      "—"
                    )}
                    {!u.email_confirmed && <span className="ml-2 text-xs text-gold">Not verified</span>}
                  </td>
                  <td className="px-3 py-2.5">{u.display_name ?? "—"}</td>
                  <td className="px-3 py-2.5">{u.github_username ?? "—"}</td>
                  <td className="px-3 py-2.5">{u.organization ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{when.format(new Date(u.joined_at))}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{u.last_sign_in_at ? when.format(new Date(u.last_sign_in_at)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
