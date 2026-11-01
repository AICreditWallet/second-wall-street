import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT_SCHEMA, DEFAULT_OUTPUT_SCHEMA, parseSchema, validateAgainst } from "./schemas";

describe("agent schemas", () => {
  it("accepts the defaults", () => {
    expect(parseSchema(JSON.stringify(DEFAULT_INPUT_SCHEMA)).ok).toBe(true);
    expect(parseSchema(JSON.stringify(DEFAULT_OUTPUT_SCHEMA)).ok).toBe(true);
  });
  it.each(["not json", "[]", '{"type":"string"}', '{"type":"object","properties":{"a":{"type":"nonsense"}}}'])("rejects %s", (t) => {
    expect(parseSchema(t).ok).toBe(false);
  });
  it("validates agent output", () => {
    expect(validateAgainst(DEFAULT_OUTPUT_SCHEMA, { summary: "ok", sources: [] })).toBeNull();
    expect(validateAgainst(DEFAULT_OUTPUT_SCHEMA, { sources: [] })).toMatch(/summary/);
  });
});
