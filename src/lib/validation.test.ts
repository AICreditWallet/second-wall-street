import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";
import { safeNext } from "./safe-next";
import { orgProfileSchema, passwordSchema, slugSchema, slugify } from "./validation";

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/claim/ofc-ll-001-1")).toBe("/claim/ofc-ll-001-1");
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "", null, "/a\nb", `/${"a".repeat(300)}`])(
    "rejects %s",
    (v) => expect(safeNext(v as string)).toBe("/dashboard"),
  );
});

describe("validation", () => {
  it("slugifies names", () => {
    expect(slugify("  Alice's Quant Lab! ")).toBe("alice-s-quant-lab");
    expect(slugSchema.safeParse(slugify("Ünïcode Café")).success).toBe(true);
  });
  it("rejects bad slugs", () => {
    for (const s of ["ab", "-abc", "abc-", "a b c", "a".repeat(41)]) expect(slugSchema.safeParse(s).success).toBe(false);
  });
  it("requires strong-enough passwords", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("letters-and-1-number").success).toBe(true);
  });
  it("only accepts https links on organisation profiles", () => {
    const base = { name: "Acme", tagline: "", description: "", github_url: "" };
    expect(orgProfileSchema.safeParse({ ...base, website_url: "javascript:alert(1)" }).success).toBe(false);
    expect(orgProfileSchema.safeParse({ ...base, website_url: "http://acme.com" }).success).toBe(false);
    expect(orgProfileSchema.safeParse({ ...base, website_url: "https://acme.com" }).data?.website_url).toBe("https://acme.com");
    expect(orgProfileSchema.safeParse({ ...base, website_url: "", github_url: "https://gitlab.com/x" }).success).toBe(false);
  });
});

describe("friendlyError", () => {
  it("maps known database codes and hides unknown ones", () => {
    expect(friendlyError({ message: "free_office_limit" })).toMatch(/already have a free office/);
    expect(friendlyError({ message: 'relation "x" does not exist' })).toBe("Something went wrong. Please try again.");
  });
});
