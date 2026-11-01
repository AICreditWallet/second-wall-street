import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PROTECTED = ["/dashboard", "/account", "/claim"];

export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const path = request.nextUrl.pathname;
  // Optimistic redirect only — every page and action re-checks the user server-side.
  if (!userId && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Public pages are not matched so they stay static and cacheable.
  matcher: ["/dashboard/:path*", "/account/:path*", "/claim/:path*", "/auth/:path*", "/api/me", "/sign-in", "/sign-up"],
};
