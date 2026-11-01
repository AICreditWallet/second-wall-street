"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { revalidateCity } from "@/lib/revalidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, slugSchema, type FormState } from "@/lib/validation";
import { AGENT_CATEGORIES, FINANCE_CATEGORIES } from "@/lib/agents/catalog";
import { checkAgentUrl } from "@/lib/agents/net-guard";
import { parseSchema } from "@/lib/agents/schemas";
import { ownedConnection, runHealthCheck, runTest } from "@/lib/agents/service";

const agentId = z.string().min(5).max(64).regex(/^[a-z0-9-]+$/);

const details = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters.").max(80),
    category: z.enum(AGENT_CATEGORIES, { message: "Choose a category." }),
    summary: z.string().trim().min(10, "Describe what the agent does (10+ characters).").max(300),
    capabilities: z
      .string()
      .max(500)
      .transform((v) => v.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 12))
      .refine((c) => c.every((x) => x.length <= 40), "Keep each capability under 40 characters."),
    disclosure: z.string().trim().max(500),
  })
  .refine((d) => !FINANCE_CATEGORIES.has(d.category) || d.disclosure.length >= 10, {
    path: ["disclosure"],
    message: "Finance agents need a disclosure (e.g. not investment advice).",
  });

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .superRefine((v, ctx) => {
    if (v === null) return;
    const c = checkAgentUrl(v);
    if (!c.ok) ctx.addIssue({ code: "custom", message: c.reason });
  });

const connection = z.object({
  endpoint_url: z.string().trim().superRefine((v, ctx) => {
    const c = checkAgentUrl(v);
    if (!c.ok) ctx.addIssue({ code: "custom", message: c.reason });
  }),
  health_url: optionalUrl,
  openapi_url: optionalUrl,
  input_schema: z.string(),
  output_schema: z.string(),
});

async function context() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  return user && supabase ? { user, supabase } : null;
}

function readDetails(fd: FormData) {
  return details.safeParse({
    name: fd.get("name"),
    category: fd.get("category"),
    summary: fd.get("summary"),
    capabilities: fd.get("capabilities") ?? "",
    disclosure: fd.get("disclosure") ?? "",
  });
}

export async function createAgent(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { message: "Please sign in to continue." };
  const parsed = readDetails(fd);
  const slug = slugSchema.safeParse(fd.get("slug"));
  const orgId = z.string().uuid().safeParse(fd.get("orgId"));
  if (!parsed.success || !slug.success) return { errors: { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...(slug.success ? {} : { slug: "3–40 lowercase letters, numbers or dashes." }) } };
  if (!orgId.success) return { message: "Choose an organisation." };

  const { data, error } = await ctx.supabase
    .from("agents")
    .insert({ ...parsed.data, slug: slug.data, organization_id: orgId.data, status: "in-development", published: false })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { errors: { slug: "That web address is taken. Try another." } };
    if (error.code === "42501") return { message: "Only organisation owners can register agents." };
    return { message: friendlyError(error) };
  }
  redirect(`/dashboard/agents/${data.id}?created=1`);
}

export async function updateAgent(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context();
  const id = agentId.safeParse(fd.get("agentId"));
  if (!ctx || !id.success) return { message: "Please sign in to continue." };
  const parsed = readDetails(fd);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { data, error } = await ctx.supabase.from("agents").update(parsed.data).eq("id", id.data).select("id");
  if (error) return { message: friendlyError(error) };
  if (!data?.length) return { message: "You don't have permission to edit this agent." };
  revalidateCity();
  return { ok: true, message: "Saved." };
}

export async function saveConnection(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context();
  const id = agentId.safeParse(fd.get("agentId"));
  if (!ctx || !id.success) return { message: "Please sign in to continue." };
  const parsed = connection.safeParse({
    endpoint_url: fd.get("endpoint_url"),
    health_url: fd.get("health_url") ?? "",
    openapi_url: fd.get("openapi_url") ?? "",
    input_schema: fd.get("input_schema"),
    output_schema: fd.get("output_schema"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const input = parseSchema(parsed.data.input_schema);
  const output = parseSchema(parsed.data.output_schema);
  if (!input.ok || !output.ok) return { errors: { ...(input.ok ? {} : { input_schema: input.error }), ...(output.ok ? {} : { output_schema: output.error }) } };
  const row = {
    agent_id: id.data,
    endpoint_url: parsed.data.endpoint_url,
    health_url: parsed.data.health_url,
    openapi_url: parsed.data.openapi_url,
    input_schema: input.schema,
    output_schema: output.schema,
  };
  const existing = await ownedConnection(ctx.supabase, id.data);
  const { error } = existing
    ? await ctx.supabase.from("agent_connections").update(row).eq("agent_id", id.data)
    : await ctx.supabase.from("agent_connections").insert(row);
  if (error) return { message: error.code === "42501" ? "You don't have permission to change this agent." : "Couldn't save the connection. Check the fields." };
  return { ok: true, message: "Connection saved. Run a health check next." };
}

export async function saveToken(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context();
  const id = agentId.safeParse(fd.get("agentId"));
  const token = z.string().min(8, "At least 8 characters.").max(500).safeParse(fd.get("token"));
  if (!ctx || !id.success) return { message: "Please sign in to continue." };
  if (!token.success) return { errors: { token: token.error.issues[0]?.message ?? "Invalid token." } };
  const { error } = await ctx.supabase.rpc("set_agent_secret", { p_agent_id: id.data, p_secret: token.data });
  if (error) return { message: friendlyError(error) };
  return { ok: true, message: "Token stored securely. It will never be shown again." };
}

export async function checkHealth(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context();
  const id = agentId.safeParse(fd.get("agentId"));
  if (!ctx || !id.success) return { message: "Please sign in to continue." };
  const conn = await ownedConnection(ctx.supabase, id.data);
  if (!conn) return { message: "Save the connection details first." };
  const r = await runHealthCheck(conn);
  if (!("ok" in r)) return { message: r.error };
  revalidateCity();
  return r.ok ? { ok: true, message: `Healthy — HTTP ${r.status} in ${r.latencyMs} ms.` } : { message: `Unhealthy: ${r.error ?? "unknown error"}` };
}

export type TestState = (NonNullable<FormState> & { output?: string | null }) | null;

export async function testAgent(_: TestState, fd: FormData): Promise<TestState> {
  const ctx = await context();
  const id = agentId.safeParse(fd.get("agentId"));
  if (!ctx || !id.success) return { message: "Please sign in to continue." };
  const conn = await ownedConnection(ctx.supabase, id.data);
  if (!conn) return { message: "Save the connection details first." };
  let input: unknown;
  try {
    input = JSON.parse(String(fd.get("input") ?? "{}"));
  } catch {
    return { errors: { input: "Sample input must be valid JSON." } };
  }
  const r = await runTest(conn, input);
  return r.ok ? { ok: true, message: `Passed in ${r.latencyMs} ms. The response matches your output schema.`, output: r.output } : { message: r.problem ?? "Test failed.", output: r.output };
}

export async function setListing(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context();
  const id = agentId.safeParse(fd.get("agentId"));
  const status = z.enum(["in-development", "preview", "live"]).safeParse(fd.get("status"));
  if (!ctx || !id.success || !status.success) return { message: "Please sign in to continue." };
  const published = fd.get("published") === "on";
  const { data, error } = await ctx.supabase.from("agents").update({ status: status.data, published }).eq("id", id.data).select("id");
  if (error) return { message: friendlyError(error) };
  if (!data?.length) return { message: "You don't have permission to change this agent." };
  revalidateCity(["/agents"]);
  return { ok: true, message: published ? "Listing updated — visible in the directory and in your office." : "Listing updated — hidden from the public." };
}

export async function deleteAgent(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context();
  const id = agentId.safeParse(fd.get("agentId"));
  if (!ctx || !id.success) return { message: "Please sign in to continue." };
  if (fd.get("confirm") !== "on") return { message: "Tick the box to confirm." };
  const { data, error } = await ctx.supabase.from("agents").delete().eq("id", id.data).select("id");
  if (error || !data?.length) return { message: "Couldn't delete this agent." };
  revalidateCity(["/agents"]);
  redirect("/dashboard?agentDeleted=1");
}
