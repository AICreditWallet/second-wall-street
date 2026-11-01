import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** OAuth and email-link (PKCE) landing: exchanges the one-time code for a session. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", url.origin));
}
