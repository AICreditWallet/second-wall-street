const COLORS = ["var(--color-cyan)", "var(--color-violet)", "var(--color-gold)", "#5eead4", "#f9a8d4"];

/** Out-of-sample equity curves (start = 100) with the benchmark dashed. Plain SVG. */
export function EquityChart({ series, benchmark }: { series: { name: string; values: number[] }[]; benchmark: number[] }) {
  const all = [...series.flatMap((s) => s.values), ...benchmark, 100];
  const hi = Math.max(...all);
  const lo = Math.min(...all);
  const n = Math.max(benchmark.length, ...series.map((s) => s.values.length));
  const W = 720;
  const H = 240;
  const pad = 28;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2);
  const y = (v: number) => 8 + ((hi - v) / (hi - lo || 1)) * (H - 36);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Out-of-sample equity curves for each strategy and the benchmark, starting at 100">
        <line x1={pad} x2={W - pad} y1={y(100)} y2={y(100)} stroke="var(--color-line-strong)" />
        <text x={2} y={y(100) + 4} fontSize={11} fill="var(--color-fg-subtle)">100</text>
        <text x={2} y={y(hi) + 10} fontSize={11} fill="var(--color-fg-subtle)">{hi.toFixed(0)}</text>
        <text x={2} y={y(lo)} fontSize={11} fill="var(--color-fg-subtle)">{lo.toFixed(0)}</text>
        <path d={line(benchmark)} fill="none" stroke="var(--color-fg-subtle)" strokeWidth={1.5} strokeDasharray="5 4" />
        {series.map((s, i) => (
          <path key={s.name} d={line(s.values)} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-fg-muted">
        {series.map((s, i) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
            {s.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-fg-subtle" aria-hidden="true" />
          Benchmark
        </span>
      </figcaption>
    </figure>
  );
}
