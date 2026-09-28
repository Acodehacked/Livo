import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { roomEnv } from "@/lib/env";

/** Service-role client for audience flows (no Supabase account). Never import from client components. */
export const createAdminClient = () => {
  const env = roomEnv();
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
};
