import { FlaskConical } from "lucide-react";

/** Always shown above research output so nobody mistakes simulated data for a market feed. */
export function DataNotice({ freshness, note }: { freshness: string; note: string }) {
  const simulated = freshness === "simulated";
  return (
    <div role="note" className={`flex gap-3 rounded-2xl border p-4 text-sm ${simulated ? "border-gold/40 bg-gold/10" : "border-line bg-ink-900"}`}>
      <FlaskConical className={`mt-0.5 size-5 shrink-0 ${simulated ? "text-gold" : "text-cyan"}`} aria-hidden="true" />
      <div>
        <p className="font-semibold">{simulated ? "Simulated data — not real prices" : `Data: ${freshness}`}</p>
        <p className="mt-1 text-fg-muted">{note} Research and education only — not investment advice. No orders are placed.</p>
      </div>
    </div>
  );
}
