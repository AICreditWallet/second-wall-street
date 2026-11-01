/** Only allow same-site relative redirects (prevents open redirects like //evil.com). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.length > 200) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
