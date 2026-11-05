import { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { STOCK } from "@/pages/Marketplace";

const when = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : "—");

function StatusPill({ s }) {
  const v = STOCK[s] || STOCK.unknown;
  return <Badge variant="outline" className={`text-[11px] ${v.cls}`}>{v.label}</Badge>;
}

export function StockHistory({ history, canEdit, onChanged }) {
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      const { data } = await api.post("/retailers/stock-check");
      toast.success(data.changes ? `${data.changes} stock changes recorded` : "No stock changes since the last check");
      onChanged();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setChecking(false); }
  };
  const events = history?.events || [];
  return (
    <Card className="p-5 space-y-4" data-testid="stock-history-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Stock change history</div>
          <p className="text-xs text-muted-foreground mt-1" data-testid="stock-history-meta">
            Checked every day at 7:00 am Lagos time · last check {when(history?.last_check?.checked_at)} · tracking since {when(history?.tracking_since)}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={check} disabled={checking} data-testid="stock-check-now-button">
            {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />} Check stock now
          </Button>
        )}
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center" data-testid="stock-history-empty">
          No stock changes recorded yet. Changes appear here after the next daily check.
        </p>
      ) : (
        <ul className="divide-y divide-border" data-testid="stock-history-list">
          {events.map((e) => (
            <li key={e.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm" data-testid={`stock-event-${e.id}`}>
              <span className="font-medium flex-1 min-w-0 truncate">{e.title}</span>
              <span className="flex items-center gap-1.5"><StatusPill s={e.from} /><ArrowRight className="h-3 w-3 text-muted-foreground" /><StatusPill s={e.to} /></span>
              <span className="text-xs text-muted-foreground whitespace-nowrap sm:w-40 sm:text-right">{when(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
