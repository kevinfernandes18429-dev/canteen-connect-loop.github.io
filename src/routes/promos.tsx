import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { uploadMedia } from "@/lib/upload";
import { canteenImage } from "@/lib/canteen-images";
import { ReportButton } from "@/components/app/ReportButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/promos")({
  head: () => ({
    meta: [
      { title: "Penawaran Kantin — Kantin IPEKA Pluit" },
      { name: "description", content: "Promo dan menu spesial dari kantin-kantin Sekolah IPEKA Pluit, lengkap dengan komentar siswa." },
      { property: "og:title", content: "Penawaran Kantin — Kantin IPEKA Pluit" },
      { property: "og:description", content: "Lihat promo terbaru dari tiap kantin dan beri komentar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PromosPage,
});

type PromoForm = { id: string | null; title: string; body: string; banner_url: string | null; is_active: boolean; canteen_id: string };

const emptyForm: PromoForm = { id: null, title: "", body: "", banner_url: null, is_active: true, canteen_id: "" };

function PromosPage() {
  const { t } = useI18n();
  const { user, role, profile } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<PromoForm>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [anon, setAnon] = useState(false);

  const { data: myCanteens } = useQuery({
    queryKey: ["promo-my-canteens", user?.id, role],
    enabled: !!user && (role === "canteen_owner" || role === "admin"),
    queryFn: async () => {
      const q = supabase.from("canteens").select("id, name, slug").order("name");
      const { data } = role === "admin" ? await q : await q.eq("owner_id", user!.id);
      return data ?? [];
    },
  });

  const { data: promos } = useQuery({
    queryKey: ["promos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("promos")
        .select("*, canteens(name, slug, image_url), promo_comments(id, body, user_id, is_anonymous, created_at)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["promo-people", (promos ?? []).length],
    enabled: !!promos,
    queryFn: async () => {
      const ids = new Set<string>();
      for (const p of promos ?? []) for (const c of (p.promo_comments ?? []) as { user_id: string }[]) ids.add(c.user_id);
      if (ids.size === 0) return {} as Record<string, { username: string; avatar_url: string | null }>;
      const { data } = await supabase.from("profiles").select("id, username, avatar_url").in("id", [...ids]);
      const map: Record<string, { username: string; avatar_url: string | null }> = {};
      for (const p of data ?? []) map[p.id] = { username: p.username, avatar_url: p.avatar_url };
      return map;
    },
  });

  const canManage = (canteenId: string) =>
    role === "admin" || (myCanteens ?? []).some((c) => c.id === canteenId);

  const openNew = () => {
    setForm({ ...emptyForm, canteen_id: (myCanteens ?? [])[0]?.id ?? "" });
    setOpen(true);
  };

  const pickBanner = async (file: File | undefined) => {
    if (!file || !user) return;
    try {
      const url = await uploadMedia(user.id, file, "promo");
      setForm((f) => ({ ...f, banner_url: url }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const savePromo = async () => {
    if (!user || !form.title.trim() || !form.canteen_id) return;
    setSaving(true);
    const payload = {
      canteen_id: form.canteen_id,
      title: form.title.trim().slice(0, 120),
      body: form.body.trim().slice(0, 2000),
      banner_url: form.banner_url,
      is_active: form.is_active,
    };
    const { error } = form.id
      ? await supabase.from("promos").update(payload).eq("id", form.id)
      : await supabase.from("promos").insert({ ...payload, created_by: user.id });
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("BANNED_WORD") ? t("filter.blocked") : error.message);
      return;
    }
    setOpen(false);
    setForm(emptyForm);
    toast.success(t("promo.saved"));
    void qc.invalidateQueries({ queryKey: ["promos"] });
  };

  const removePromo = async (id: string) => {
    if (!window.confirm(t("promo.deleteConfirm"))) return;
    const { error } = await supabase.from("promos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["promos"] });
  };

  const removeComment = async (id: string) => {
    if (!window.confirm(t("promo.deleteCommentConfirm"))) return;
    const { error } = await supabase.from("promo_comments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["promos"] });
  };

  const sendComment = async (promoId: string) => {
    if (!user || !comment.trim()) return;
    const { error } = await supabase
      .from("promo_comments")
      .insert({ promo_id: promoId, user_id: user.id, body: comment.trim().slice(0, 1000), is_anonymous: anon });
    if (error) {
      toast.error(error.message.includes("BANNED_WORD") ? t("filter.blocked") : error.message);
      return;
    }
    setComment("");
    setCommentFor(null);
    void qc.invalidateQueries({ queryKey: ["promos"] });
  };

  const visible = (promos ?? []).filter((p) => p.is_active || canManage(p.canteen_id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{t("promo.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("promo.sub")}</p>
        </div>
        {(myCanteens ?? []).length > 0 && (
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            {t("promo.new")}
          </Button>
        )}
        {!user && (
          <Button asChild size="sm">
            <Link to="/auth">{t("auth.signin")}</Link>
          </Button>
        )}
      </div>

      <div className="stagger mt-7 space-y-6">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">{t("promo.empty")}</p>}
        {visible.map((p) => {
          const canteen = p.canteens as { name: string; slug: string; image_url: string | null } | null;
          const comments = (p.promo_comments ?? []) as {
            id: string;
            body: string;
            user_id: string;
            is_anonymous: boolean;
            created_at: string;
          }[];
          return (
            <article key={p.id} className="surface-card anim-rise overflow-hidden">
              <div className="aspect-[16/7] w-full overflow-hidden bg-secondary">
                <img
                  src={p.banner_url || canteenImage(canteen?.slug ?? "", canteen?.image_url ?? null)}
                  alt={p.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {canteen?.slug ? (
                      <Link to="/canteen/$slug" params={{ slug: canteen.slug }} className="text-xs font-semibold text-primary hover:underline">
                        {canteen.name}
                      </Link>
                    ) : null}
                    <h2 className="font-display text-xl font-bold">{p.title}</h2>
                    {!p.is_active && <span className="text-xs text-muted-foreground">({t("promo.active")}: ✗)</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <ReportButton targetType="promo" targetId={p.id} context={p.title} />
                    {canManage(p.canteen_id) && (
                      <>
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setForm({
                              id: p.id,
                              title: p.title,
                              body: p.body,
                              banner_url: p.banner_url,
                              is_active: p.is_active,
                              canteen_id: p.canteen_id,
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="text-muted-foreground hover:text-destructive" onClick={() => removePromo(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {p.body && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.body}</p>}

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 -ml-2"
                  onClick={() => setCommentFor(commentFor === p.id ? null : p.id)}
                >
                  <MessageSquare className="mr-1 h-4 w-4" />
                  {comments.length} {t("promo.comment")}
                </Button>

                {comments.length > 0 && (
                  <div className="mt-2 space-y-3 border-l-2 border-border pl-3">
                    {comments.map((c) => {
                      const person = people?.[c.user_id];
                      const hidden = c.is_anonymous && role !== "admin";
                      return (
                        <div key={c.id} className="flex items-start gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={hidden ? undefined : person?.avatar_url ?? undefined} alt="" />
                            <AvatarFallback className="text-[10px]">
                              {hidden ? "?" : (person?.username ?? "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold">
                              {hidden ? t("anon.label") : "@" + (person?.username ?? "user")}
                              {c.is_anonymous && role === "admin" && (
                                <span className="ml-1 text-[10px] font-normal text-muted-foreground">({t("anon.label")})</span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">{c.body}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <ReportButton targetType="promo_comment" targetId={c.id} context={c.body} />
                            {(user?.id === c.user_id || role === "admin" || canManage(p.canteen_id)) && (
                              <button className="text-muted-foreground hover:text-destructive" onClick={() => removeComment(c.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {commentFor === p.id &&
                  (user ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={comment}
                          maxLength={1000}
                          placeholder={t("promo.commentPlaceholder")}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <Button size="sm" onClick={() => sendComment(p.id)}>
                          {t("common.send")}
                        </Button>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={anon} onCheckedChange={setAnon} />
                        {t("anon.post")} — {t("anon.adminNote")}
                      </label>
                    </div>
                  ) : (
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link to="/auth">{t("auth.signin")}</Link>
                    </Button>
                  ))}
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? t("promo.edit") : t("promo.new")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(myCanteens ?? []).length > 1 && (
              <div className="space-y-1.5">
                <Label>{t("admin.assignCanteen")}</Label>
                <select
                  value={form.canteen_id}
                  onChange={(e) => setForm({ ...form, canteen_id: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {(myCanteens ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("promo.name")}</Label>
              <Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("promo.body")}</Label>
              <Textarea value={form.body} rows={4} maxLength={2000} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("promo.banner")}</Label>
              <Input type="file" accept="image/*" onChange={(e) => pickBanner(e.target.files?.[0])} />
              {form.banner_url && <img src={form.banner_url} alt="" className="mt-2 h-28 w-full rounded-xl object-cover" />}
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              {t("promo.active")}
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </label>
            <Button className="w-full" onClick={savePromo} disabled={saving || !form.title.trim()}>
              {t("settings.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
