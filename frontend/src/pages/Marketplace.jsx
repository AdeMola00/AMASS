import { useEffect, useState, useCallback } from "react";
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
import { Plus, Trash2, Loader2, Star, Megaphone, Tag, ShoppingBag } from "lucide-react";

const money = (p) => (p >= 1000000 ? `₦${(p / 1e6).toLocaleString()}M` : `₦${(p || 0).toLocaleString()}`);

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
      <Card className="overflow-hidden"><div className="overflow-x-auto amass-scroll">
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="hidden md:table-cell">Category</TableHead><TableHead>Price</TableHead><TableHead>Featured</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-14 text-muted-foreground"><ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-40" /> No products.</TableCell></TableRow>}
            {rows.map((p) => (
              <TableRow key={p.id} data-testid={`product-row-${p.id}`}>
                <TableCell><div className="flex items-center gap-3">{p.images?.[0] && <img src={mediaUrl(p.images[0])} alt="" className="h-9 w-9 rounded object-cover" />}<span className="font-medium">{p.title}</span></div></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{p.category_name || "—"}</TableCell>
                <TableCell className="font-medium">{money(p.price)}</TableCell>
                <TableCell><Switch checked={p.featured} disabled={!canEdit} onCheckedChange={(v) => flag(p, { featured: v })} data-testid={`product-featured-${p.id}`} /></TableCell>
                <TableCell><Badge variant="outline" className={p.status === "active" ? "text-emerald-600 border-emerald-500/30" : "text-muted-foreground"}>{p.status}</Badge></TableCell>
                <TableCell className="text-right">{canEdit && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(p.id)} data-testid={`product-delete-${p.id}`}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></Card>
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
        <TabsList>
          <TabsTrigger value="categories" data-testid="mp-tab-categories"><Tag className="h-4 w-4 mr-1.5" /> Categories</TabsTrigger>
          <TabsTrigger value="products" data-testid="mp-tab-products"><ShoppingBag className="h-4 w-4 mr-1.5" /> Products</TabsTrigger>
          <TabsTrigger value="promotions" data-testid="mp-tab-promotions"><Megaphone className="h-4 w-4 mr-1.5" /> Promotions</TabsTrigger>
          <TabsTrigger value="pricing" data-testid="mp-tab-pricing"><Star className="h-4 w-4 mr-1.5" /> Pricing</TabsTrigger>
        </TabsList>
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
