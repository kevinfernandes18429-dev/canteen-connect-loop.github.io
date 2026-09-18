import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/** Permanently deletes the signed-in user's own account. Canteens they own stay, but lose their owner. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? null;

    // keep the canteen running, just without an owner ("closed")
    await supabaseAdmin.from("canteens").update({ owner_id: null }).eq("owner_id", userId);

    if (email) {
      await supabaseAdmin.from("deleted_accounts").upsert({ email, reason: "self" }, { onConflict: "email" });
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error("Failed to delete account");
    return { ok: true };
  });
