import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, MailCheck } from "lucide-react";

export function DigestButton({ canEdit }) {
  const [info, setInfo] = useState(null);
  const [sending, setSending] = useState(false);
  const load = () => api.get("/website/digest").then((r) => setInfo(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/website/digest/send-now");
      toast.success(`Digest sent to ${data.to}: ${data.new_yesterday} new yesterday, ${data.pending} need a reply`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setSending(false); }
  };
  if (!info) return null;
  return (
    <div className="flex flex-col items-start sm:items-end gap-1" data-testid="digest-info">
      {canEdit && (
        <Button variant="outline" size="sm" onClick={send} disabled={sending} data-testid="digest-send-now-button">
          {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MailCheck className="h-4 w-4 mr-2" />} Email digest now
        </Button>
      )}
      <p className="text-xs text-muted-foreground" data-testid="digest-schedule-text">
        Daily digest to {info.to}, 8:00 am Lagos time{info.last ? ` · last sent ${new Date(info.last.sent_at).toLocaleString()}` : ""}
      </p>
    </div>
  );
}
