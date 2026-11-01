import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TYPES = new Set<EmailOtpType>(["signup", "email", "recovery", "email_change", "invite", "magiclink"]);

/** Email-template landing using token_hash (works across devices, unlike PKCE codes). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"), type === "recovery" ? "/account/update-password" : "/dashboard");
  const supabase = await createSupabaseServerClient();
  if (supabase && tokenHash && type && TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", url.origin));
}
