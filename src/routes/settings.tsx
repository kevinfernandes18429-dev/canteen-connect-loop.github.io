import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useI18n, type Lang, type TKey } from "@/lib/i18n";
import { uploadMedia } from "@/lib/upload";
import { useTheme, type Theme } from "@/lib/theme";
import { ClassPicker } from "@/components/app/ClassPicker";
import { EMPTY_CLASS, isClassComplete, parseClass, serializeClass, type ClassValue } from "@/lib/classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Pengaturan Profil — Kantin IPEKA Pluit" },
      { name: "description", content: "Atur foto profil, banner, bio, status kehadiran, bahasa, dan verifikasi 2 langkah." },
      { property: "og:title", content: "Pengaturan Profil — Kantin IPEKA Pluit" },
      { property: "og:description", content: "Personalisasi profil kantinmu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const PRESENCES = ["online", "idle", "dnd", "invisible"] as const;

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { user, profile, role, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [klass, setKlass] = useState<ClassValue>(EMPTY_CLASS);
  const [form, setForm] = useState({
    full_name: "",
    bio: "",
    status_text: "",
    status_emoji: "",
    presence: "online" as (typeof PRESENCES)[number],
    avatar_url: null as string | null,
    banner_url: null as string | null,
    two_factor_enabled: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setKlass(parseClass(profile.class));
    setForm({
      full_name: profile.full_name,
      bio: profile.bio,
      status_text: profile.status_text,
      status_emoji: profile.status_emoji,
      presence: profile.presence,
      avatar_url: profile.avatar_url,
      banner_url: profile.banner_url,
      two_factor_enabled: profile.two_factor_enabled,
    });
  }, [profile]);

  const pick = async (kind: "avatar" | "banner", file: File | undefined) => {
    if (!file || !user) return;
    try {
      const url = await uploadMedia(user.id, file, kind);
      setForm((f) => ({ ...f, [kind === "avatar" ? "avatar_url" : "banner_url"]: url }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const save = async () => {
    if (!user) return;
    const uname = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(uname)) { toast.error(t("settings.usernameHint")); return; }
    if (role === "student" && !isClassComplete(klass)) { toast.error(t("auth.class")); return; }
    setSaving(true);
    if (uname !== profile?.username) {
      const { data: available } = await supabase.rpc("username_available", { _username: uname });
      if (available === false) { setSaving(false); toast.error(t("auth.usernameTaken")); return; }
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        username: uname,
        full_name: form.full_name.slice(0, 80),
        class: role === "student" ? serializeClass(klass) : "",
        bio: form.bio.slice(0, 300),
        status_text: form.status_text.slice(0, 80),
        status_emoji: form.status_emoji.slice(0, 8),
        presence: form.presence,
        avatar_url: form.avatar_url,
        banner_url: form.banner_url,
        two_factor_enabled: form.two_factor_enabled,
        language: lang,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message.includes("unique") ? t("auth.usernameTaken") : error.message); return; }
    await refreshProfile();
    toast.success(t("settings.saved"));
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted-foreground">{t("nav.signin")}</p>
        <Button asChild className="mt-4">
          <Link to="/auth">{t("auth.signin")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">{t("settings.title")}</h1>
      <Tabs defaultValue="profile" className="mt-6">
        <TabsList>
          <TabsTrigger value="profile">{t("settings.profile")}</TabsTrigger>
          <TabsTrigger value="security">{t("settings.security")}</TabsTrigger>
          <TabsTrigger value="lang">{t("settings.appearance")} · {t("settings.theme")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-5">
          <div
            className="h-32 rounded-2xl bg-primary/15 bg-cover bg-center"
            style={form.banner_url ? { backgroundImage: `url(${form.banner_url})` } : undefined}
          />
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={form.avatar_url ?? undefined} alt={profile?.username ?? ""} />
              <AvatarFallback>{(profile?.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="grid gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("settings.avatar")}</Label>
                <Input type="file" accept="image/*" onChange={(e) => pick("avatar", e.target.files?.[0])} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("settings.banner")}</Label>
                <Input type="file" accept="image/*" onChange={(e) => pick("banner", e.target.files?.[0])} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("settings.username")}</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <Input value={username} maxLength={20} className="pl-7" onChange={(e) => setUsername(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.usernameHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("auth.fullName")}</Label>
            <Input value={form.full_name} maxLength={80} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          {role === "student" && (
            <div className="space-y-1.5">
              <Label>{t("auth.class")}</Label>
              <ClassPicker value={klass} onChange={setKlass} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("settings.bio")}</Label>
            <Textarea value={form.bio} maxLength={300} rows={3} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("settings.presence")}</Label>
              <Select value={form.presence} onValueChange={(v) => setForm({ ...form, presence: v as typeof form.presence })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESENCES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(("presence." + p) as TKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.statusText")}</Label>
              <div className="flex gap-2">
                <Input
                  value={form.status_emoji}
                  maxLength={8}
                  placeholder="🍜"
                  className="w-16"
                  onChange={(e) => setForm({ ...form, status_emoji: e.target.value })}
                />
                <Input value={form.status_text} maxLength={80} onChange={(e) => setForm({ ...form, status_text: e.target.value })} />
              </div>
            </div>
          </div>
          <Button onClick={save} disabled={saving}>
            {t("settings.save")}
          </Button>
        </TabsContent>

        <TabsContent value="security" className="mt-6 space-y-5">
          <TwoFactorPanel />
          <DangerZone />
        </TabsContent>


        <TabsContent value="lang" className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label>{t("settings.language")}</Label>
            <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">Bahasa Indonesia</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.theme")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["light", "dark", "system"] as Theme[]).map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => setTheme(th)}
                  className={
                    "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors " +
                    (theme === th ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:bg-secondary")
                  }
                >
                  {t(("theme." + th) as TKey)}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={save} disabled={saving}>
            {t("settings.save")}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
function TwoFactorPanel() {
  const { t } = useI18n();
  const { user, refreshProfile } = useAuth();
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })));
  };

  useEffect(() => {
    void load();
  }, [user?.id]);

  const verified = factors.find((f) => f.status === "verified");

  const start = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Kantin " + Date.now(),
    });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? t("common.error"));
      return;
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirm = async () => {
    if (!enroll) return;
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) return;
    setBusy(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
    if (chErr || !ch) {
      setBusy(false);
      toast.error(chErr?.message ?? t("common.error"));
      return;
    }
    const { error } = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.id, code: token });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (user) await supabase.from("profiles").update({ two_factor_enabled: true }).eq("id", user.id);
    setEnroll(null);
    setCode("");
    await load();
    await refreshProfile();
    toast.success(t("settings.saved"));
  };

  const disable = async () => {
    if (!verified) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (user) await supabase.from("profiles").update({ two_factor_enabled: false }).eq("id", user.id);
    await load();
    await refreshProfile();
    toast.success(t("settings.saved"));
  };

  return (
    <div className="surface-card space-y-4 p-5">
      <div>
        <p className="font-semibold">{t("settings.2fa")}</p>
        <p className="text-sm text-muted-foreground">{t("auth.2faDesc")}</p>
      </div>

      {verified ? (
        <Button variant="destructive" onClick={disable} disabled={busy}>
          {t("common.delete")}
        </Button>
      ) : enroll ? (
        <div className="space-y-3">
          <img src={enroll.qr} alt="QR" className="h-44 w-44 rounded-xl bg-white p-2" />
          <p className="break-all text-xs text-muted-foreground">{enroll.secret}</p>
          <Input value={code} inputMode="numeric" maxLength={6} placeholder="123456" onChange={(e) => setCode(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={busy || code.replace(/\D/g, "").length !== 6}>
              {t("auth.verify")}
            </Button>
            <Button variant="outline" onClick={() => setEnroll(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={start} disabled={busy}>
          {t("auth.2faTitle")}
        </Button>
      )}
    </div>
  );
}

function DangerZone() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const router = useRouter();
  const removeAccount = useServerFn(deleteMyAccount);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await removeAccount({ data: undefined });
      await signOut();
      toast.success(t("account.deleted"));
      await router.navigate({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-card space-y-3 border-destructive/40 p-5">
      <div>
        <p className="font-semibold text-destructive">{t("account.delete")}</p>
        <p className="text-sm text-muted-foreground">{t("account.deleteDesc")}</p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={busy}>
            {t("account.delete")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("account.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("account.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={run} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
