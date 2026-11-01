import type { ReactNode } from "react";

const tones = {
  cyan: "border-cyan/30 bg-cyan/10 text-cyan-soft",
  gold: "border-gold/30 bg-gold/10 text-gold",
  violet: "border-violet/30 bg-violet/10 text-violet",
  muted: "border-line bg-white/5 text-fg-muted",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
