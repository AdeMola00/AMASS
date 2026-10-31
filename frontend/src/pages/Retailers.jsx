import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Store, PackageX, ArrowLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { groupRetailers, useMarketplaceProducts } from "@/lib/retailers";
import { StockBadge, money, shortDate } from "@/pages/Marketplace";
import { mediaUrl } from "@/components/ImageUploader";

function Stat({ label, value, red, testid }) {
  return (
    <div className={`rounded-lg p-3 ${red ? "bg-destructive/5 border border-destructive/20" : "bg-muted/40"}`} data-testid={testid}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-heading text-xl font-extrabold ${red ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function RetailerCard({ r }) {
  const oos = r.out_of_stock.length;
  return (
    <Link to={`/admin/retailers/${encodeURIComponent(r.id)}`} data-testid={`retailer-card-${r.id}`}>
      <Card className="p-5 h-full hover:border-primary/40 hover:shadow-md transition-[border-color,box-shadow]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Store className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="font-semibold truncate">{r.name}</div>
              <div className="text-xs text-muted-foreground truncate">{r.categories.join(" · ") || "No category"}</div>
            </div>
          </div>
          {oos > 0 ? (
            <Badge variant="destructive" className="shrink-0" data-testid={`retailer-oos-badge-${r.id}`}><PackageX className="h-3 w-3 mr-1" /> {oos} out</Badge>
          ) : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Stat label="Products" value={r.products.length} />
          <Stat label="In stock" value={r.in_stock} />
          <Stat label="Unknown" value={r.unknown} />
        </div>
        <div className="text-xs text-muted-foreground mt-3">Last updated {shortDate(r.updated)}</div>
      </Card>
    </Link>
  );
}

function RetailerList({ retailers }) {
  const sorted = [...retailers].sort((a, b) => b.out_of_stock.length - a.out_of_stock.length || b.products.length - a.products.length);
  const totalOos = retailers.reduce((n, r) => n + r.out_of_stock.length, 0);
  return (
    <div className="space-y-6" data-testid="retailers-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Retailers</h1>
        <p className="text-muted-foreground text-sm mt-1">Live from the AMASS app marketplace: {retailers.length} retailers, {totalOos} products out of stock.</p>
      </div>
      {retailers.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground" data-testid="retailers-empty">No retailers yet.</Card>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{sorted.map((r) => <RetailerCard key={r.id} r={r} />)}</div>
    </div>
  );
}

function OutOfStockAlert({ items }) {
  if (!items.length) return null;
  return (
    <Card className="p-5 border-destructive/30 bg-destructive/5" role="alert" data-testid="retailer-oos-alert">
      <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> {items.length} {items.length === 1 ? "product is" : "products are"} out of stock</div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((p) => (
          <li key={p.id} className="flex justify-between gap-3" data-testid={`retailer-oos-item-${p.id}`}>
            <span className="truncate">{p.title}</span><span className="text-muted-foreground whitespace-nowrap">{p.category_name}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RetailerDetail({ r }) {
  const navigate = useNavigate();
  const products = [...r.products].sort((a, b) => ({ out_of_stock: 0, unknown: 1, in_stock: 2 }[a.stock_status] ?? 1) - ({ out_of_stock: 0, unknown: 1, in_stock: 2 }[b.stock_status] ?? 1));
  return (
    <div className="space-y-6" data-testid="retailer-detail-page">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/retailers")} data-testid="retailer-back-button"><ArrowLeft className="h-4 w-4 mr-1.5" /> All retailers</Button>
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2" data-testid="retailer-name"><Store className="h-6 w-6 text-primary" /> {r.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">{r.categories.join(" · ")} · last updated {shortDate(r.updated)}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Products" value={r.products.length} testid="retailer-stat-products" />
        <Stat label="In stock" value={r.in_stock} testid="retailer-stat-in-stock" />
        <Stat label="Out of stock" value={r.out_of_stock.length} red={r.out_of_stock.length > 0} testid="retailer-stat-out-of-stock" />
        <Stat label="Stock unknown" value={r.unknown} testid="retailer-stat-unknown" />
      </div>
      <OutOfStockAlert items={r.out_of_stock} />
      <Card className="overflow-hidden"><div className="overflow-x-auto amass-scroll">
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="hidden md:table-cell">Category</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead className="hidden lg:table-cell">Updated</TableHead></TableRow></TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id} data-testid={`retailer-product-row-${p.id}`}>
                <TableCell><div className="flex items-center gap-3">{p.images?.[0] && <img src={mediaUrl(p.images[0])} alt="" className="h-9 w-9 rounded object-cover" loading="lazy" />}<span className="font-medium">{p.title}</span></div></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{p.category_name || "—"}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{money(p.price)}</TableCell>
                <TableCell><StockBadge p={p} /></TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{shortDate(p.updated_at || p.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></Card>
    </div>
  );
}

export default function Retailers() {
  const { rid } = useParams();
  const { products, loading, error } = useMarketplaceProducts();
  const retailers = useMemo(() => groupRetailers(products), [products]);
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (error) return <Card className="p-8 text-center text-sm text-destructive" data-testid="retailers-error">Couldn't load marketplace products. Please try again.</Card>;
  if (!rid) return <RetailerList retailers={retailers} />;
  const r = retailers.find((x) => x.id === decodeURIComponent(rid));
  if (!r) return <Card className="p-8 text-center text-sm text-muted-foreground" data-testid="retailer-not-found">Retailer not found. <Link to="/admin/retailers" className="text-primary underline">See all retailers</Link></Card>;
  return <RetailerDetail r={r} />;
}
