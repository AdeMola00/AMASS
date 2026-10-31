import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, MailCheck, TrendingUp } from "lucide-react";

const when = (d) => (d ? ` · last sent ${new Date(d).toLocaleString()}` : "");

function SendButton({ path, label, icon: Icon, onDone, testid, describe }) {
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post(path);
      toast.success(describe(data));
      onDone();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setSending(false); }
  };
  return (
    <Button variant="outline" size="sm" onClick={send} disabled={sending} data-testid={testid}>
      {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Icon className="h-4 w-4 mr-2" />} {label}
    </Button>
  );
}

export function DigestButton({ canEdit }) {
  const [info, setInfo] = useState(null);
  const load = () => api.get("/website/digest").then((r) => setInfo(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!info) return null;
  return (
    <div className="flex flex-col items-start sm:items-end gap-1" data-testid="digest-info">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <SendButton path="/website/digest/send-now" label="Email digest now" icon={MailCheck} onDone={load} testid="digest-send-now-button"
            describe={(d) => `Digest sent to ${d.to}: ${d.new_yesterday} new yesterday, ${d.pending} need a reply`} />
          <SendButton path="/website/weekly-trends/send-now" label="Email weekly trends now" icon={TrendingUp} onDone={load} testid="weekly-send-now-button"
            describe={(d) => `Weekly trends sent to ${d.to}: ${d.last_week} last week vs ${d.week_before} the week before`} />
        </div>
      )}
      <p className="text-xs text-muted-foreground" data-testid="digest-schedule-text">
        Daily digest to {info.to}, 8:00 am Lagos time{when(info.last?.sent_at)}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="weekly-schedule-text">
        Weekly trends every Monday, 8:00 am Lagos time{when(info.last_weekly?.sent_at)}
      </p>
    </div>
  );
}
