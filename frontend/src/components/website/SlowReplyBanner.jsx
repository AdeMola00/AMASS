import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLeadAlerts } from "@/context/LeadAlertsContext";

const fmtWait = (h) => (h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

export function SlowReplyBanner({ onView }) {
  const { overdue } = useLeadAlerts();
  const navigate = useNavigate();
  if (!overdue?.count) return null;
  const view = onView || (() => navigate("/admin/website-leads?filter=overdue"));
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert" data-testid="slow-reply-banner">
      <div className="h-9 w-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-destructive" data-testid="slow-reply-banner-count">
          {overdue.count} website {overdue.count === 1 ? "lead has" : "leads have"} waited over {overdue.slow_hours} hours without a reply
        </div>
        <div className="text-sm text-muted-foreground">The oldest has been waiting {fmtWait(overdue.oldest_hours)}.</div>
      </div>
      <Button variant="destructive" size="sm" onClick={view} data-testid="slow-reply-banner-view">
        View overdue leads <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>
    </div>
  );
}
