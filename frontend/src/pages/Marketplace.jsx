import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ImageUploader, mediaUrl } from "@/components/ImageUploader";
import { Plus, Trash2, Loader2, Star, Megaphone, Tag, ShoppingBag, Search, Store, PackageCheck, PackageX, PackageSearch } from "lucide-react";

export const STOCK = {
  in_stock: { label: "In stock", cls: "text-emerald-600 border-emerald-500/30 bg-emerald-500/5" },
  out_of_stock: { label: "Out of stock", cls: "text-destructive border-destructive/30 bg-destructive/5" },
  unknown: { label: "Unknown", cls: "text-muted-foreground" },
};
const PAGE = 25;
export const shortDate = (d) => (d ? new Date(d.endsWith("Z") || d.includes("+") ? d : `${d}Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export function StockBadge({ p }) {
  const s = STOCK[p.stock_status] || STOCK.unknown;
  return (
    <Badge variant="outline" className={s.cls} data-testid={`product-stock-${p.id}`}>
      {s.label}{p.stock_status === "in_stock" && p.stock > 0 ? ` · ${p.stock}` : ""}
    </Badge>
  );
}

function ProductSummary({ rows }) {
  const count = (s) => rows.filter((p) => (p.stock_status || "unknown") === s).length;
  const items = [
    { label: "Products", value: rows.length, icon: ShoppingBag, id: "total" },
    { label: "Retailers", value: new Set(rows.map((p) => p.retailer_id || p.seller).filter(Boolean)).size, icon: Store, id: "retailers" },
    { label: "In stock", value: count("in_stock"), icon: PackageCheck, id: "in-stock" },
    { label: "Out of stock", value: count("out_of_stock"), icon: PackageX, id: "out-of-stock" },
    { label: "Stock unknown", value: count("unknown"), icon: PackageSearch, id: "unknown" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((i) => (
        <Card key={i.id} className="p-4" data-testid={`mp-summary-${i.id}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide"><i.icon className="h-3.5 w-3.5" /> {i.label}</div>
          <div className="font-heading text-2xl font-extrabold mt-1">{i.value}</div>
        </Card>
      ))}
    </div>
  );
}

function FilterSelect({ value, onChange, all, options, testid }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full md:w-44" data-testid={testid}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export const money = (p) => (!p ? "Price on request" : p >= 1000000 ? `₦${(p / 1e6).toLocaleString()}M` : `₦${p.toLocaleString()}`);

function CategoriesTab({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", image: "", active: true, order: 0 });
  const load = () => api.get("/marketplace/categories").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => {
    try { await api.post("/marketplace/categories", { ...form, order: Number(form.order) || 0 }); toast.success("Category added"); setOpen(false); setForm({ name: "", slug: "", image: "", active: true, order: 0 }); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => { await api.delete(`/marketplace/categories/${id}`); toast.success("Deleted"); load(); };
  return (
    <div className="space-y-4">
      {canEdit && <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button data-testid="add-category-button"><Plus className="h-4 w-4 mr-2" /> New Category</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">New Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="category-name" /></div>
            <div className="space-y-1.5"><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Image</Label><ImageUploader value={form.image} onChange={(v) => setForm({ ...form, image: v })} folder="marketplace" /></div>
          </div>
          <DialogFooter><Button onClick={create} disabled={!form.name} data-testid="category-create">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((c) => (
          <Card key={c.id} className="overflow-hidden" data-testid={`category-${c.id}`}>
            {c.image && <img src={mediaUrl(c.image)} alt="" className="h-28 w-full object-cover" />}
            <div className="p-4 flex items-center justify-between">
              <div><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.slug}</div></div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={c.active ? "text-emerald-600 border-emerald-500/30" : "text-muted-foreground"}>{c.active ? "Active" : "Hidden"}</Badge>
                {canEdit && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(c.id)} data-testid={`category-delete-${c.id}`}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProductsTab({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category_id: "", price: "", images: [], seller: "AMASS Home", stock: "", featured: false, status: "active" });
  const load = () => api.get("/marketplace/products").then((r) => setRows(r.data));
  useEffect(() => { load(); api.get("/marketplace/categories").then((r) => setCats(r.data)); }, []);
  const create = async () => {
    try { await api.post("/marketplace/products", { ...form, price: Number(form.price) || 0, stock: Number(form.stock) || 0, images: form.images.filter(Boolean) }); toast.success("Product added"); setOpen(false); setForm({ title: "", description: "", category_id: "", price: "", images: [], seller: "AMASS Home", stock: "", featured: false, status: "active" }); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const flag = async (p, patch) => { await api.patch(`/marketplace/products/${p.id}/flags`, patch); load(); };
  const del = async (id) => { await api.delete(`/marketplace/products/${id}`); toast.success("Deleted"); load(); };
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [seller, setSeller] = useState("all");
  const [stock, setStock] = useState("all");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setShown(PAGE); }, [q, cat, seller, stock]);
  const sellers = useMemo(() => [...new Set(rows.map((p) => p.seller).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter((p) =>
    (cat === "all" || p.category_id === cat) &&
    (seller === "all" || p.seller === seller) &&
    (stock === "all" || (p.stock_status || "unknown") === stock) &&
    (!q || `${p.title} ${p.seller || ""}`.toLowerCase().includes(q.toLowerCase()))
  ), [rows, q, cat, seller, stock]);
  return (
    <div className="space-y-4">
      {canEdit && <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button data-testid="add-product-button"><Plus className="h-4 w-4 mr-2" /> New Product</Button></DialogTrigger>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto amass-scroll">
          <DialogHeader><DialogTitle className="font-heading">New Product</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="product-title" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Category</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}><SelectTrigger data-testid="product-category"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Price (NGN)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="product-price" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Stock</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} /><Label>Featured</Label></div>
            </div>
            <div className="space-y-1.5"><Label>Image</Label><ImageUploader value={form.images[0] || ""} onChange={(v) => setForm({ ...form, images: v ? [v] : [] })} folder="marketplace" /></div>
          </div>
          <DialogFooter><Button onClick={create} disabled={!form.title || !form.price} data-testid="product-create">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      <ProductSummary rows={rows} />
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products or sellers" className="pl-9" data-testid="mp-product-search" />
        </div>
        <FilterSelect value={cat} onChange={setCat} all="All categories" options={cats.map((c) => ({ value: c.id, label: c.name }))} testid="mp-filter-category" />
        <FilterSelect value={seller} onChange={setSeller} all="All sellers" options={sellers.map((s) => ({ value: s, label: s }))} testid="mp-filter-seller" />
        <FilterSelect value={stock} onChange={setStock} all="Any stock" options={Object.entries(STOCK).map(([value, s]) => ({ value, label: s.label }))} testid="mp-filter-stock" />
      </div>
      <Card className="overflow-hidden"><div className="overflow-x-auto amass-scroll">
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="hidden md:table-cell">Category</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Featured</TableHead><TableHead className="hidden lg:table-cell">Status</TableHead><TableHead className="hidden lg:table-cell">Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-14 text-muted-foreground" data-testid="mp-products-empty"><ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-40" /> No products match.</TableCell></TableRow>}
            {filtered.slice(0, shown).map((p) => (
              <TableRow key={p.id} data-testid={`product-row-${p.id}`}>
                <TableCell><div className="flex items-center gap-3">{p.images?.[0] && <img src={mediaUrl(p.images[0])} alt="" className="h-9 w-9 rounded object-cover" loading="lazy" />}<div><div className="font-medium">{p.title}</div>{p.seller && <div className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`product-seller-${p.id}`}><Store className="h-3 w-3" /> {p.seller}</div>}</div></div></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{p.category_name || "—"}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{money(p.price)}</TableCell>
                <TableCell><StockBadge p={p} /></TableCell>
                <TableCell><Switch checked={p.featured} disabled={!canEdit} onCheckedChange={(v) => flag(p, { featured: v })} data-testid={`product-featured-${p.id}`} /></TableCell>
                <TableCell className="hidden lg:table-cell"><Badge variant="outline" className={p.status === "active" ? "text-emerald-600 border-emerald-500/30" : "text-muted-foreground"}>{p.status}</Badge></TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap" data-testid={`product-updated-${p.id}`}>{shortDate(p.updated_at || p.created_at)}</TableCell>
                <TableCell className="text-right">{canEdit && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(p.id)} data-testid={`product-delete-${p.id}`}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></Card>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span data-testid="mp-products-count">Showing {Math.min(shown, filtered.length)} of {filtered.length}</span>
        {shown < filtered.length && <Button variant="outline" size="sm" onClick={() => setShown((s) => s + PAGE)} data-testid="mp-products-more">Show more</Button>}
      </div>
    </div>
  );
}

function SimpleListTab({ endpoint, canEdit, fields, testid, icon: Icon }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""])));
  const load = () => api.get(endpoint).then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => { try { await api.post(endpoint, form); toast.success("Added"); setOpen(false); setForm(Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""]))); load(); } catch (e) { toast.error("Failed"); } };
  const del = async (id) => { await api.delete(`${endpoint}/${id}`); toast.success("Deleted"); load(); };
  return (
    <div className="space-y-4">
      {canEdit && <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button data-testid={`add-${testid}`}><Plus className="h-4 w-4 mr-2" /> Add</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">New Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">{fields.map((f) => (
            <div key={f.key} className="space-y-1.5"><Label>{f.label}</Label><Input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} /></div>
          ))}</div>
          <DialogFooter><Button onClick={create} data-testid={`${testid}-create`}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      <div className="space-y-2">
        {rows.length === 0 && <Card className="p-10 text-center text-muted-foreground"><Icon className="h-8 w-8 mx-auto mb-2 opacity-40" /> Nothing yet.</Card>}
        {rows.map((r) => (
          <Card key={r.id} className="p-4 flex items-center justify-between" data-testid={`${testid}-${r.id}`}>
            <div><div className="font-medium">{r.title || r.name}</div><div className="text-xs text-muted-foreground">{r.value || r.kind}</div></div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={r.active ? "text-emerald-600 border-emerald-500/30" : "text-muted-foreground"}>{r.active ? "Active" : "Off"}</Badge>
              {canEdit && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Marketplace() {
  const { can } = useAuth();
  const canEdit = can("marketplace", "edit");
  return (
    <div className="space-y-6" data-testid="marketplace-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Marketplace</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage categories, products, promotions and pricing — live in the app.</p>
      </div>
      <Tabs defaultValue="categories">
        <div className="overflow-x-auto amass-scroll pb-1"><TabsList className="inline-flex flex-nowrap">
          <TabsTrigger value="categories" data-testid="mp-tab-categories"><Tag className="h-4 w-4 mr-1.5" /> Categories</TabsTrigger>
          <TabsTrigger value="products" data-testid="mp-tab-products"><ShoppingBag className="h-4 w-4 mr-1.5" /> Products</TabsTrigger>
          <TabsTrigger value="promotions" data-testid="mp-tab-promotions"><Megaphone className="h-4 w-4 mr-1.5" /> Promotions</TabsTrigger>
          <TabsTrigger value="pricing" data-testid="mp-tab-pricing"><Star className="h-4 w-4 mr-1.5" /> Pricing</TabsTrigger>
        </TabsList></div>
        <TabsContent value="categories" className="mt-4"><CategoriesTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="products" className="mt-4"><ProductsTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="promotions" className="mt-4">
          <SimpleListTab endpoint="/marketplace/promotions" canEdit={canEdit} testid="promotion" icon={Megaphone}
            fields={[{ key: "title", label: "Title" }, { key: "kind", label: "Kind (discount/banner/sponsored)", default: "discount" }, { key: "value", label: "Value" }]} />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <SimpleListTab endpoint="/marketplace/pricing-rules" canEdit={canEdit} testid="pricing" icon={Star}
            fields={[{ key: "name", label: "Name" }, { key: "kind", label: "Kind (commission/listing_fee/featured_fee)", default: "commission" }, { key: "value", label: "Value" }]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
