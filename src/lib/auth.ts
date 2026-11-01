import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { safeNext } from "./safe-next";

export { safeNext };

export interface SessionUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
}

/** The verified current user, or null. Uses getUser(), which checks with Supabase Auth. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, emailVerified: Boolean(data.user.email_confirmed_at) };
}

export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(safeNext(next))}`);
  return user;
}
