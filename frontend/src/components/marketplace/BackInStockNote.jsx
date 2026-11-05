import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, Star, X, Loader2 } from "lucide-react";
import { mediaUrl } from "@/components/ImageUploader";
import { money } from "@/pages/Marketplace";

const when = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

function Item({ it, canEdit, onFeature, onDismiss }) {
  const [busy, setBusy] = useState("");
  const run = async (kind, fn) => { setBusy(kind); await fn(it); setBusy(""); };
  return (
    <li className="flex flex-wrap sm:flex-nowrap items-center gap-3 py-2.5" data-testid={`back-in-stock-item-${it.product_id}`}>
      {it.image ? <img src={mediaUrl(it.image)} alt="" className="h-10 w-10 rounded object-cover shrink-0" loading="lazy" /> : <div className="h-10 w-10 rounded bg-muted shrink-0" />}
      <div className="flex-1 min-w-[calc(100%-3.25rem)] sm:min-w-0">
        <div className="font-medium truncate">{it.title}</div>
        <div className="text-xs text-muted-foreground truncate">
          <Link to={`/admin/retailers/${encodeURIComponent(it.retailer_id)}`} className="hover:underline">{it.seller}</Link> · {money(it.price)} · back {when(it.at)}
        </div>
      </div>
      <div className="flex items-center gap-1 ml-[3.25rem] sm:ml-0 shrink-0">
      {it.featured ? (
        <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 shrink-0" data-testid={`back-in-stock-featured-${it.product_id}`}><Star className="h-3 w-3 mr-1 fill-current" /> Featured</Badge>
      ) : canEdit && (
        <Button size="sm" onClick={() => run("feature", onFeature)} disabled={!!busy} className="shrink-0" data-testid={`back-in-stock-feature-${it.product_id}`}>
          {busy === "feature" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Star className="h-3.5 w-3.5 mr-1.5" />} Feature in app
        </Button>
      )}
      {canEdit && (
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => run("dismiss", onDismiss)} disabled={!!busy} title="Dismiss" data-testid={`back-in-stock-dismiss-${it.product_id}`}>
          <X className="h-4 w-4" />
        </Button>
      )}
      </div>
    </li>
  );
}

function Note({ canEdit }) {
  const [items, setItems] = useState([]);
  const load = useCallback(() => api.get("/retailers/back-in-stock").then((r) => setItems(r.data.items)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const feature = async (it) => {
    try {
      await api.patch(`/marketplace/products/${it.product_id}/flags`, { featured: true });
      toast.success(`${it.title} is now featured in the app`);
      setItems((p) => p.map((x) => (x.product_id === it.product_id ? { ...x, featured: true } : x)));
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const dismiss = async (it) => {
    try {
      await api.post(`/retailers/back-in-stock/${it.event_id}/dismiss`);
      setItems((p) => p.filter((x) => x.event_id !== it.event_id));
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4" data-testid="back-in-stock-note">
      <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400" data-testid="back-in-stock-count">
        <PackageCheck className="h-5 w-5" /> {items.length} {items.length === 1 ? "product is" : "products are"} back in stock
      </div>
      <p className="text-sm text-muted-foreground mt-0.5">Feature them in the app so customers see they're available again.</p>
      <ul className="divide-y divide-border mt-2">
        {items.map((it) => <Item key={it.event_id} it={it} canEdit={canEdit} onFeature={feature} onDismiss={dismiss} />)}
      </ul>
    </div>
  );
}

export function BackInStockNote({ enabled, canEdit }) {
  return enabled ? <Note canEdit={canEdit} /> : null;
}
