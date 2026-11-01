import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !auth.user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return NextResponse.json({ error: "export_failed" }, { status: 500 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="second-wall-street-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
