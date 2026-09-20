import { supabase } from "@/integrations/supabase/client";

/** Canteen ids the user owns or co-manages. */
export async function myCanteenIds(userId: string): Promise<string[]> {
  const [{ data: owned }, { data: managed }] = await Promise.all([
    supabase.from("canteens").select("id").eq("owner_id", userId),
    supabase.from("canteen_managers").select("canteen_id").eq("user_id", userId),
  ]);
  const ids = new Set<string>();
  for (const c of owned ?? []) ids.add(c.id);
  for (const m of managed ?? []) ids.add(m.canteen_id);
  return [...ids];
}

/** The canteen this user works at (owned first, otherwise co-managed). */
export async function fetchMyCanteen(userId: string) {
  const { data: owned } = await supabase.from("canteens").select("*").eq("owner_id", userId).maybeSingle();
  if (owned) return owned;
  const { data: m } = await supabase
    .from("canteen_managers")
    .select("canteen_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!m) return null;
  const { data } = await supabase.from("canteens").select("*").eq("id", m.canteen_id).maybeSingle();
  return data;
}
