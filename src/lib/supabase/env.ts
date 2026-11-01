/** Supabase configuration. The app runs in a read-only demo mode when these are missing. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
