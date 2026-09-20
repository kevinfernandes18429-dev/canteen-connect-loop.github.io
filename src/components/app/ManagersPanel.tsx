import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { id: string; user_id: string; created_at: string };

export function ManagersPanel({ canteenId, ownerId }: { canteenId: string; ownerId?: string | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");

  const { data } = useQuery({
    queryKey: ["canteen-managers", canteenId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("canteen_managers")
        .select("id, user_id, created_at")
        .eq("canteen_id", canteenId)
        .order("created_at");
      const ids = [...new Set([...(rows ?? []).map((r) => r.user_id), ...(ownerId ? [ownerId] : [])])];
      const people: Record<string, { username: string; full_name: string; avatar_url: string | null }> = {};
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .in("id", ids);
        for (const p of profiles ?? []) people[p.id] = { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url };
      }
      return { rows: (rows ?? []) as Row[], people };
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const uname = username.trim().toLowerCase();
      if (!uname) throw new Error(t("manager.username"));
      const { data: p } = await supabase.from("profiles").select("id").eq("username", uname).maybeSingle();
      if (!p) throw new Error(t("chat.userNotFound"));
      if (p.id === ownerId) throw new Error(t("manager.alreadyOwner"));
      const { error } = await supabase.from("canteen_managers").insert({ canteen_id: canteenId, user_id: p.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setUsername("");
      toast.success(t("settings.saved"));
      qc.invalidateQueries({ queryKey: ["canteen-managers", canteenId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("canteen_managers").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["canteen-managers", canteenId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const person = (id: string) => data?.people[id];

  return (
    <div className="surface-card p-5">
      <h3 className="font-display text-lg font-bold">{t("manager.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("manager.hint")}</p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="manager-username">{t("manager.username")}</Label>
          <Input
            id="manager-username"
            value={username}
            placeholder="username"
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending}>
          {t("manager.add")}
        </Button>
      </div>

      <div className="mt-5 space-y-2">
        {ownerId && (
          <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
            <span className="flex-1 text-sm font-semibold">
              {person(ownerId)?.full_name || person(ownerId)?.username || "—"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">@{person(ownerId)?.username}</span>
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">{t("manager.owner")}</span>
          </div>
        )}
        {(data?.rows ?? []).length === 0 && !ownerId && (
          <p className="text-sm text-muted-foreground">{t("manager.empty")}</p>
        )}
        {(data?.rows ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
            <span className="flex-1 text-sm font-semibold">
              {person(r.user_id)?.full_name || person(r.user_id)?.username || "—"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">@{person(r.user_id)?.username}</span>
            </span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{t("manager.role")}</span>
            <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)} aria-label={t("manager.remove")}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
