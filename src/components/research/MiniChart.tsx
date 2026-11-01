type Bar = { o: number; h: number; l: number; c: number };

/** Minute candles for the 9:30–9:45 window with VWAP and the opening range. Plain SVG, no client JS. */
export function MiniChart({ bars, vwap, orHigh, orLow, label }: { bars: Bar[]; vwap: number[]; orHigh: number; orLow: number; label: string }) {
  if (!bars.length) return null;
  const W = 240;
  const H = 96;
  const pad = 6;
  const hi = Math.max(...bars.map((b) => b.h), ...vwap);
  const lo = Math.min(...bars.map((b) => b.l), ...vwap);
  const y = (v: number) => pad + ((hi - v) / (hi - lo || 1)) * (H - pad * 2);
  const step = (W - pad * 2) / bars.length;
  const x = (i: number) => pad + step * i + step / 2;
  const path = vwap.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label={label}>
      <line x1={pad} x2={W - pad} y1={y(orHigh)} y2={y(orHigh)} stroke="var(--color-line-strong)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <line x1={pad} x2={W - pad} y1={y(orLow)} y2={y(orLow)} stroke="var(--color-line-strong)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      {bars.map((b, i) => {
        const up = b.c >= b.o;
        const color = up ? "var(--color-cyan)" : "var(--color-danger)";
        return (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <rect x={x(i) - step * 0.3} width={step * 0.6} y={y(Math.max(b.o, b.c))} height={Math.max(1, Math.abs(y(b.o) - y(b.c)))} fill={color} />
          </g>
        );
      })}
      <path d={path} fill="none" stroke="var(--color-gold)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
