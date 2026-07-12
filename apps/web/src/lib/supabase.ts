/**
 * Supabase browser client for HooperIQ.
 * No-ops gracefully when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Demo player seeded in hooperiq/supabase/seed.sql */
export const DEMO_PLAYER_ID = "22222222-2222-2222-2222-222222222222";
