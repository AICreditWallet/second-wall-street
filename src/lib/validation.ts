import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(72, "Use at most 72 characters.")
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Use letters and at least one number.");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "3–40 lowercase letters, numbers or dashes.");

export const orgNameSchema = z.string().trim().min(2, "At least 2 characters.").max(60, "At most 60 characters.");
export const officeIdSchema = z.string().regex(/^ofc-[a-z]{2}-\d{3}-\d{1,2}$/);

const optionalHttps = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https:\/\/[^\s/$.?#][^\s]*$/.test(v), "Must start with https://");

export const orgProfileSchema = z.object({
  name: orgNameSchema,
  tagline: z.string().trim().max(120, "At most 120 characters."),
  description: z.string().trim().max(2000, "At most 2000 characters."),
  website_url: optionalHttps,
  github_url: optionalHttps.refine(
    (v) => v === null || /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}(\/[A-Za-z0-9_.-]{1,100})?\/?$/.test(v),
    "Use a link like https://github.com/your-org",
  ),
});

export const displayNameSchema = z.string().trim().min(1, "Required.").max(60, "At most 60 characters.");

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Returns the first error message per field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string> } | null;
