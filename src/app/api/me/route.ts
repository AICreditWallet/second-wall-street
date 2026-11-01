import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Minimal session info for the header, so public pages can stay static. */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ configured: isSupabaseConfigured, user: null }, { headers });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ configured: true, user: null }, { headers });
  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", data.user.id).maybeSingle();
  return NextResponse.json(
    { configured: true, user: { name: profile?.display_name ?? data.user.email?.split("@")[0] ?? "Account", avatarUrl: profile?.avatar_url ?? null } },
    { headers },
  );
}
