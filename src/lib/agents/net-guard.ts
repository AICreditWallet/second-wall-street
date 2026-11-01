import { BlockList, isIP } from "node:net";

/**
 * Outbound-request guard (SSRF protection). Agents are third-party services:
 * we only ever call public HTTPS endpoints, never private networks, loopback,
 * cloud metadata services or other internal infrastructure.
 */
// Separate lists: Node matches IPv4 addresses against IPv4-mapped IPv6 rules
// in a shared BlockList, which would block every public IPv4 address.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked4.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked6.addSubnet(net, bits, "ipv6");

export function isPublicAddress(ip: string) {
  const family = isIP(ip);
  if (family === 0) return false;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) is judged by its IPv4 address.
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return !blocked4.check(mapped[1]!, "ipv4");
  if (/^::ffff:/i.test(ip)) return false; // other mapped forms: refuse rather than guess
  return family === 4 ? !blocked4.check(ip, "ipv4") : !blocked6.check(ip, "ipv6");
}

const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|metadata\.google\.internal)$/i;

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Static checks before any DNS lookup. */
export function checkAgentUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Agent endpoints must use https://." };
  if (url.username || url.password) return { ok: false, reason: "Don't put credentials in the URL — use the token field." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Only the standard HTTPS port (443) is allowed." };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!isPublicAddress(host)) return { ok: false, reason: "That address is on a private or reserved network." };
  } else if (!host.includes(".") || BLOCKED_HOSTS.test(host)) {
    return { ok: false, reason: "Use a public domain name." };
  }
  if (raw.length > 300) return { ok: false, reason: "URL is too long." };
  return { ok: true, url };
}
