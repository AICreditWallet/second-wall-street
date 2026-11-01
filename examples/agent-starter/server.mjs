// Second Wall Street — minimal agent (protocol v0). No dependencies.
// Run: AGENT_TOKEN=change-me node server.mjs   (then host it behind HTTPS)
import { createServer } from "node:http";

const TOKEN = process.env.AGENT_TOKEN ?? ""; // optional bearer token
const PORT = Number(process.env.PORT ?? 8787);

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

// Replace this with your agent's real work.
async function handle(input) {
  const query = String(input.query ?? "").slice(0, 500);
  return {
    summary: `You asked: "${query}". This starter agent echoes your question — replace handle() with real research.`,
    sources: [],
  };
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/run")) return send(res, 200, { ok: true });
  if (req.method !== "POST" || url.pathname !== "/run") return send(res, 404, { error: "not_found" });
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: "unauthorized" });
  try {
    const { task_id, input } = await readJson(req);
    const output = await handle(input ?? {});
    send(res, 200, { task_id, output });
  } catch (e) {
    send(res, 400, { error: e.message === "too_large" ? "payload_too_large" : "bad_request" });
  }
}).listen(PORT, () => console.log(`Agent listening on http://localhost:${PORT}`));
