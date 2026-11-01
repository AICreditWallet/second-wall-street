import Ajv, { type AnySchema } from "ajv";

const ajv = new Ajv({ allErrors: false, strict: false, validateSchema: true });

export const DEFAULT_INPUT_SCHEMA = {
  type: "object",
  properties: { query: { type: "string", description: "What the user is asking for." } },
  required: ["query"],
};
export const DEFAULT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
  },
  required: ["summary"],
};

/** Parses and checks a JSON Schema object supplied by a developer. */
export function parseSchema(text: string): { ok: true; schema: Record<string, unknown> } | { ok: false; error: string } {
  let schema: unknown;
  try {
    schema = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { ok: false, error: "The schema must be a JSON object." };
  if ((schema as { type?: unknown }).type !== "object") return { ok: false, error: 'The top-level schema must have "type": "object".' };
  if (text.length > 12_000) return { ok: false, error: "The schema is too large (max 12 KB)." };
  try {
    ajv.compile(schema as AnySchema);
  } catch (e) {
    return { ok: false, error: `Invalid JSON Schema: ${(e as Error).message.slice(0, 160)}` };
  }
  return { ok: true, schema: schema as Record<string, unknown> };
}

/** Validates data against a schema; returns a short human-readable problem or null. */
export function validateAgainst(schema: Record<string, unknown>, data: unknown): string | null {
  const validate = ajv.compile(schema as AnySchema);
  if (validate(data)) return null;
  const e = validate.errors?.[0];
  return e ? `${e.instancePath || "(root)"} ${e.message}` : "Does not match the schema.";
}
