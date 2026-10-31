import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PackageX, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groupRetailers, useMarketplaceProducts } from "@/lib/retailers";

function Banner() {
  const navigate = useNavigate();
  const { products } = useMarketplaceProducts();
  const hit = useMemo(() => groupRetailers(products).filter((r) => r.out_of_stock.length), [products]);
  const count = hit.reduce((n, r) => n + r.out_of_stock.length, 0);
  if (!count) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert" data-testid="oos-banner">
      <div className="h-9 w-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0"><PackageX className="h-5 w-5" /></div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-destructive" data-testid="oos-banner-count">
          {count} marketplace {count === 1 ? "product is" : "products are"} out of stock
        </div>
        <div className="text-sm text-muted-foreground truncate">At {hit.map((r) => `${r.name} (${r.out_of_stock.length})`).join(", ")}</div>
      </div>
      <Button variant="destructive" size="sm" onClick={() => navigate("/admin/retailers")} data-testid="oos-banner-view">
        View retailers <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>
    </div>
  );
}

export function OutOfStockBanner({ enabled }) {
  return enabled ? <Banner /> : null;
}
