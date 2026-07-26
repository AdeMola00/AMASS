import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Search, Loader2, Building2, Trash2, Plus, CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";

const STATUS_STYLES = {
  approved: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  pending: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30",
  rejected: "bg-destructive/12 text-destructive border-destructive/25",
  sold: "bg-muted text-muted-foreground border-border",
};

function money(p, c) {
  if (!p) return "—";
  if (p >= 1000000) return `${c === "NGN" ? "₦" : ""}${(p / 1000000).toLocaleString()}M`;
  return `${c === "NGN" ? "₦" : ""}${p.toLocaleString()}`;
}

export default function Properties() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ types: [], listings: [], statuses: [], cities: [] });
  const [f, setF] = useState({ search: "", city: "all", type: "all", status: "all" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "Apartment", listing: "Sale", city: "Lagos", address: "", price: "", bedrooms: "", bathrooms: "", area_sqm: "", image: "" });
  const [busy, setBusy] = useState(false);

  const canEdit = can("properties", "edit");
  const canVerify = can("property_verification", "edit");
  const canDelete = can("properties", "delete");
  const canCreate = can("properties", "create");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/properties", { params: f });
      setRows(data);
    } finally { setLoading(false); }
  }, [f]);

  useEffect(() => { api.get("/properties-meta").then((r) => setMeta(r.data)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const setStatus = async (id, status) => {
    await api.patch(`/properties/${id}/status`, { status });
    setRows((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(`Marked ${status}`);
  };
  const toggleVerify = async (row) => {
    await api.patch(`/properties/${row.id}/verify`, { verified: !row.verified });
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, verified: !row.verified } : r)));
    toast.success(!row.verified ? "Property verified" : "Verification removed");
  };
  const remove = async (id) => {
    await api.delete(`/properties/${id}`);
    setRows((p) => p.filter((r) => r.id !== id));
    toast.success("Property deleted");
  };
  const create = async () => {
    setBusy(true);
    try {
      await api.post("/properties", {
        ...form, price: Number(form.price) || 0, bedrooms: Number(form.bedrooms) || 0,
        bathrooms: Number(form.bathrooms) || 0, area_sqm: Number(form.area_sqm) || 0,
      });
      toast.success("Property created (pending approval)");
      setOpen(false); load();
      setForm({ title: "", description: "", type: "Apartment", listing: "Sale", city: "Lagos", address: "", price: "", bedrooms: "", bathrooms: "", area_sqm: "", image: "" });
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="properties-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Properties</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage every listing across the AMASS marketplace.</p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-property-button"><Plus className="h-4 w-4 mr-2" /> New Property</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto amass-scroll">
              <DialogHeader><DialogTitle className="font-heading">New Property</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="prop-title" /></div>
                <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger data-testid="prop-type"><SelectValue /></SelectTrigger>
                      <SelectContent>{meta.types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>Listing</Label>
                    <Select value={form.listing} onValueChange={(v) => setForm({ ...form, listing: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{meta.listings.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>City</Label>
                    <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{meta.cities.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>Price (NGN)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="prop-price" /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Beds</Label><Input type="number" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Baths</Label><Input type="number" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Area m²</Label><Input type="number" value={form.area_sqm} onChange={(e) => setForm({ ...form, area_sqm: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>Image URL</Label><Input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={create} disabled={busy || !form.title || !form.price} data-testid="prop-create">{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="prop-search" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} placeholder="Search title, address, agent..." className="pl-9" />
        </div>
        <Select value={f.city} onValueChange={(v) => setF({ ...f, city: v })}><SelectTrigger className="lg:w-40" data-testid="prop-filter-city"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Cities</SelectItem>{meta.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}><SelectTrigger className="lg:w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Types</SelectItem>{meta.types.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}><SelectTrigger className="lg:w-40" data-testid="prop-filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Statuses</SelectItem>{meta.statuses.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto amass-scroll">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Property</TableHead>
              <TableHead className="hidden md:table-cell">City</TableHead>
              <TableHead className="hidden lg:table-cell">Agent</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Verified</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground"><Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" /> No properties found.</TableCell></TableRow>}
              {!loading && rows.map((r) => (
                <TableRow key={r.id} data-testid={`property-row-${r.id}`} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.type} · {r.listing} · {r.bedrooms}bd</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.city}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{r.agent_name || "—"}</TableCell>
                  <TableCell className="font-medium">{money(r.price, r.currency)}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Select value={r.status} onValueChange={(v) => setStatus(r.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs" data-testid={`prop-status-${r.id}`}><Badge variant="outline" className={`capitalize ${STATUS_STYLES[r.status]}`}>{r.status}</Badge></SelectTrigger>
                        <SelectContent>{meta.statuses.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <Badge variant="outline" className={`capitalize ${STATUS_STYLES[r.status]}`}>{r.status}</Badge>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {r.verified ? <Badge variant="outline" className="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</Badge>
                                : <Badge variant="outline" className="text-muted-foreground">Unverified</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canVerify && (
                        <Button size="icon" variant="ghost" onClick={() => toggleVerify(r)} title={r.verified ? "Remove verification" : "Verify"} data-testid={`prop-verify-${r.id}`}>
                          {r.verified ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4 text-primary" />}
                        </Button>
                      )}
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive" data-testid={`prop-delete-${r.id}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete this property?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(r.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
