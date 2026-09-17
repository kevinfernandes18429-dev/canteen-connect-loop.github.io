import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, formatRupiah } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Debt = {
  id: string;
  student_id: string;
  amount: number;
  note: string;
  paid: boolean;
  created_at: string;
};

export function DebtsPanel({ canteenId }: { canteenId: string }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const { data } = useQuery({
    queryKey: ["debts", canteenId],
    queryFn: async () => {
      const { data: debts } = await supabase
        .from("debts")
        .select("id, student_id, amount, note, paid, created_at")
        .eq("canteen_id", canteenId)
        .order("created_at", { ascending: false });
      const ids = [...new Set((debts ?? []).map((d) => d.student_id))];
      const names: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", ids);
        for (const p of profiles ?? []) names[p.id] = p.username;
      }
      return { debts: (debts ?? []) as Debt[], names };
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const uname = username.trim().toLowerCase();
      const value = Math.max(0, Math.round(Number(amount) || 0));
      if (!uname || value <= 0) throw new Error(t("debt.amount"));
      const { data: p } = await supabase.from("profiles").select("id").eq("username", uname).maybeSingle();
      if (!p) throw new Error(t("chat.userNotFound"));
      const { error } = await supabase
        .from("debts")
        .insert({ canteen_id: canteenId, student_id: p.id, amount: value, note: note.trim().slice(0, 200) });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setUsername("");
      setAmount("");
      setNote("");
      toast.success(t("settings.saved"));
      void qc.invalidateQueries({ queryKey: ["debts", canteenId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPaid = async (id: string, paid: boolean) => {
    const { error } = await supabase
      .from("debts")
      .update({ paid, paid_at: paid ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["debts", canteenId] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("debts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["debts", canteenId] });
  };

  const debts = data?.debts ?? [];
  const unpaidTotal = debts.filter((d) => !d.paid).reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-4">
      <div className="surface-card grid gap-3 p-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>{t("debt.student")}</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
        </div>
        <div className="space-y-1.5">
          <Label>{t("debt.amount")}</Label>
          <Input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("debt.note")}</Label>
          <div className="flex gap-2">
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            <Button disabled={add.isPending} onClick={() => add.mutate()}>{t("debt.add")}</Button>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("debt.total")}: <span className="font-semibold text-foreground">{formatRupiah(unpaidTotal)}</span>
      </p>

      {debts.length === 0 && <p className="text-sm text-muted-foreground">{t("debt.empty")}</p>}
      <div className="stagger space-y-2">
        {debts.map((d) => (
          <div key={d.id} className="surface-card flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                @{data?.names[d.student_id] ?? "user"} · {formatRupiah(d.amount)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {new Date(d.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID")}
                {d.note ? ` · ${d.note}` : ""}
              </p>
            </div>
            <span
              className={
                "rounded-full px-3 py-1 text-xs font-semibold " +
                (d.paid ? "bg-success/15 text-success" : "bg-warning/20 text-foreground")
              }
            >
              {d.paid ? t("debt.paid") : t("debt.unpaid")}
            </span>
            {!d.paid && (
              <Button size="sm" variant="outline" onClick={() => setPaid(d.id, true)}>
                {t("debt.markPaid")}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(d.id)}>
              {t("common.delete")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
