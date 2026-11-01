import { NextResponse, type NextRequest } from "next/server";
import { createSupabasePublicClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TARGET = /^(agent:[a-z0-9-]{5,64}|organization:[0-9a-f-]{36})$/;

/** Reviews for one agent/organisation plus what the current viewer may do. */
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("target") ?? "";
  if (!TARGET.test(target)) return NextResponse.json({ error: "bad_target" }, { status: 400 });
  const [kind, id] = target.split(":") as ["agent" | "organization", string];
  const headers = { "Cache-Control": "private, no-store" };

  const userDb = await createSupabaseServerClient();
  const db = userDb ?? createSupabasePublicClient();
  if (!db) return NextResponse.json({ reviews: [], viewer: { signedIn: false, canReview: false, isOwner: false } }, { headers });

  const col = kind === "agent" ? "agent_id" : "organization_id";
  const { data: rows, error } = await db
    .from("reviews")
    .select("id, rating, body, created_at, updated_at, owner_response, owner_responded_at, author_id, status")
    .eq(col, id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ reviews: [], viewer: { signedIn: false, canReview: false, isOwner: false }, unavailable: true }, { headers });

  const authorIds = [...new Set((rows ?? []).map((r) => r.author_id as string))];
  const { data: profiles } = authorIds.length ? await db.from("profiles").select("id, display_name, github_username").in("id", authorIds) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name as string) ?? (p.github_username as string) ?? "Member"]));

  let viewer = { signedIn: false, canReview: false, isOwner: false, myReviewId: null as string | null };
  if (userDb) {
    const { data: auth } = await userDb.auth.getUser();
    if (auth.user) {
      const orgId =
        kind === "organization" ? id : ((await userDb.from("agents").select("organization_id").eq("id", id).maybeSingle()).data?.organization_id as string | undefined);
      const { data: membership } = orgId
        ? await userDb.from("organization_members").select("role").eq("organization_id", orgId).eq("user_id", auth.user.id).maybeSingle()
        : { data: null };
      const mine = (rows ?? []).find((r) => r.author_id === auth.user!.id);
      viewer = {
        signedIn: true,
        isOwner: membership?.role === "owner" || membership?.role === "admin",
        canReview: !membership && !mine && Boolean(auth.user.email_confirmed_at),
        myReviewId: (mine?.id as string) ?? null,
      };
    }
  }

  // RLS already limits rows to published reviews plus the viewer's own.
  const reviews = (rows ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.created_at,
      edited: r.updated_at !== r.created_at,
      author: names.get(r.author_id as string) ?? "Member",
      mine: r.id === viewer.myReviewId,
      ownerResponse: r.owner_response,
      ownerRespondedAt: r.owner_responded_at,
      hidden: r.status !== "published",
    }));
  return NextResponse.json({ reviews, viewer }, { headers });
}
