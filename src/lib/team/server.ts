import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
export function administration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Team administration is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
