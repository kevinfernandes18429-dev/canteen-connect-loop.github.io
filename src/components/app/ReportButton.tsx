import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ReportTarget =
  | "message"
  | "promo"
  | "promo_comment"
  | "review"
  | "forum_post"
  | "forum_comment"
  | "user";

export function ReportButton({
  targetType,
  targetId,
  context = "",
  className,
}: {
  targetType: ReportTarget;
  targetId: string;
  context?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  if (!user) return null;

  const send = async () => {
    setSending(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      context: context.slice(0, 500),
      reason: reason.trim().slice(0, 500),
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    setReason("");
    toast.success(t("report.sent"));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("report.action")}
        aria-label={t("report.action")}
        className={
          "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive " +
          (className ?? "")
        }
      >
        <Flag className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("report.title")}</DialogTitle>
            <DialogDescription>{context.slice(0, 160) || t("report.reason")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            rows={4}
            maxLength={500}
            placeholder={t("report.reason")}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button onClick={send} disabled={sending || !reason.trim()}>
            {t("report.send")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
