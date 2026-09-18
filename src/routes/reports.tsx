import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useI18n, type TKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Laporan Saya — Kantin IPEKA Pluit" },
      { name: "description", content: "Pantau status laporan yang kamu kirim: baru, ditangani, atau diabaikan." },
      { property: "og:title", content: "Laporan Saya — Kantin IPEKA Pluit" },
      { property: "og:description", content: "Lihat perkembangan laporan konten yang kamu kirim." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const STATUS_STYLE: Record<string, string> = {
  open: "bg-warning/20 text-foreground",
  resolved: "bg-success/15 text-success",
  dismissed: "bg-muted text-muted-foreground",
};

function ReportsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["my-reports", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("id, target_type, reason, context, status, created_at")
        .eq("reporter_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

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

  const rows = data ?? [];
  const render = (list: typeof rows) =>
    list.length === 0 ? (
      <p className="mt-6 text-sm text-muted-foreground">{t("report.myEmpty")}</p>
    ) : (
      <div className="stagger mt-6 space-y-3">
        {list.map((r) => (
          <article key={r.id} className="surface-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{r.target_type}</p>
              <span className={"rounded-full px-3 py-1 text-xs font-semibold " + (STATUS_STYLE[r.status] ?? "")}>
                {t(("report.status." + r.status) as TKey)}
              </span>
            </div>
            {r.reason && <p className="mt-2 text-sm">{r.reason}</p>}
            {r.context && <p className="mt-1 truncate text-xs text-muted-foreground">“{r.context}”</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString(lang === "en" ? "en-GB" : "id-ID")}
            </p>
          </article>
        ))}
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">{t("report.mine")}</h1>
      <Tabs defaultValue="open" className="mt-6">
        <TabsList>
          <TabsTrigger value="open">{t("report.status.open")}</TabsTrigger>
          <TabsTrigger value="resolved">{t("report.status.resolved")}</TabsTrigger>
          <TabsTrigger value="dismissed">{t("report.status.dismissed")}</TabsTrigger>
        </TabsList>
        <TabsContent value="open">{render(rows.filter((r) => r.status === "open"))}</TabsContent>
        <TabsContent value="resolved">{render(rows.filter((r) => r.status === "resolved"))}</TabsContent>
        <TabsContent value="dismissed">{render(rows.filter((r) => r.status === "dismissed"))}</TabsContent>
      </Tabs>
    </div>
  );
}
