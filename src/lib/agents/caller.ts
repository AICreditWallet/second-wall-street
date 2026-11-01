import "server-only";
import { lookup } from "node:dns";
import { Agent, fetch } from "undici";
import { checkAgentUrl, isPublicAddress } from "./net-guard";

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 6000;

/**
 * Connection-time DNS check: every address a hostname resolves to must be
 * public. Validating here (not before the request) defeats DNS rebinding.
 */
const guardedAgent = new Agent({
  connect: {
    timeout: TIMEOUT_MS,
    lookup: (hostname, options, callback) => {
      lookup(hostname, { all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4);
        const list = Array.isArray(addresses) ? addresses : [];
        if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
          return callback(Object.assign(new Error("blocked_address"), { code: "EBLOCKED" }), "", 4);
        }
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
        callback(null, list[0]!.address, list[0]!.family);
      });
    },
  },
  maxResponseSize: MAX_BYTES,
});

export interface CallResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  body: unknown;
  error: string | null;
}

/** Calls an agent endpoint from the server only. Never follows redirects. */
export async function callAgent(rawUrl: string, init: { method: "GET" | "POST"; token?: string | null; json?: unknown }): Promise<CallResult> {
  const checked = checkAgentUrl(rawUrl);
  if (!checked.ok) return { ok: false, status: null, latencyMs: 0, body: null, error: checked.reason };
  const started = performance.now();
  try {
    const res = await fetch(checked.url, {
      method: init.method,
      dispatcher: guardedAgent,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "SecondWallStreet-AgentBridge/1.0 (+https://secondwallstreet.com/developers)",
        accept: "application/json",
        ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const latencyMs = Math.round(performance.now() - started);
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: res.status, latencyMs, body: null, error: "Redirects are not followed — use the final URL." };
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, latencyMs, body, error: res.ok ? null : `Agent responded with HTTP ${res.status}.` };
  } catch (e) {
    const latencyMs = Math.round(performance.now() - started);
    const msg = String((e as { cause?: { code?: string; message?: string } }).cause?.code ?? (e as Error).name ?? "");
    const error = /EBLOCKED|blocked_address/.test(msg + String((e as Error).message) + String((e as { cause?: Error }).cause?.message))
      ? "That address resolves to a private or reserved network."
      : /Timeout|abort/i.test(msg + String((e as Error).message))
        ? "The agent didn't respond within 6 seconds."
        : /RESPONSE_EXCEEDED|max.*size/i.test(msg + String((e as Error).message))
          ? "The response was larger than 256 KB."
          : "Couldn't connect to the agent.";
    return { ok: false, status: null, latencyMs, body: null, error };
  }
}
