import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, Plus, Trash2, KeyRound, CheckCircle2, ShieldCheck, ShieldOff, Building2, Link2 } from "lucide-react";

const CITIES = ["Lagos", "Abuja", "Accra", "Nairobi", "Kigali", "Cape Town"];
const money = (p) => (p >= 1000000 ? `₦${(p / 1e6).toLocaleString()}M` : `₦${(p || 0).toLocaleString()}`);

export default function PropertyOwners() {
  const { can } = useAuth();
  const canEdit = can("property_owners", "edit");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "Lagos" });
  const [detail, setDetail] = useState(null);
  const [detailProps, setDetailProps] = useState([]);
  const [unowned, setUnowned] = useState([]);
  const [linkId, setLinkId] = useState("");

  const load = useCallback(() => api.get("/property-owners", { params: { search } }).then((r) => setRows(r.data)), [search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const create = async () => { try { await api.post("/property-owners", form); toast.success("Owner added"); setOpen(false); setForm({ name: "", email: "", phone: "", city: "Lagos" }); load(); } catch { toast.error("Failed"); } };
  const verify = async (r) => { await api.patch(`/property-owners/${r.id}/verify`, { verified: !r.verified }); load(); };
  const del = async (id) => { await api.delete(`/property-owners/${id}`); toast.success("Removed"); load(); };

  const openDetail = async (o) => {
    setDetail(o); setLinkId("");
    const [{ data: props }, { data: all }] = await Promise.all([
      api.get(`/property-owners/${o.id}/properties`),
      api.get("/properties"),
    ]);
    setDetailProps(props);
    setUnowned(all.filter((p) => !p.owner_id));
  };
  const linkProperty = async () => {
    if (!linkId) return;
    await api.patch(`/property-owners/assign/${linkId}`, { owner_id: detail.id });
    toast.success("Property linked");
    openDetail(detail); load();
  };

  return (
    <div className="space-y-6" data-testid="property-owners-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Property Owners</h1>
          <p className="text-muted-foreground text-sm mt-1">Owner profiles with every property linked to them.</p>
        </div>
        {canEdit && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-owner-button"><Plus className="h-4 w-4 mr-2" /> Add Owner</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-heading">Add Property Owner</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Full Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="owner-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>City</Label><Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <DialogFooter><Button onClick={create} disabled={!form.name} data-testid="owner-create">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </div>

      <Card className="p-4"><div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search owners..." className="pl-9" data-testid="owner-search" /></div></Card>

      <Card className="overflow-hidden"><div className="overflow-x-auto amass-scroll">
        <Table>
          <TableHeader><TableRow><TableHead>Owner</TableHead><TableHead className="hidden md:table-cell">City</TableHead><TableHead>Properties</TableHead><TableHead>Verified</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-14 text-muted-foreground"><KeyRound className="h-8 w-8 mx-auto mb-2 opacity-40" /> No owners.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`owner-row-${r.id}`} className="cursor-pointer hover:bg-muted/40" onClick={() => openDetail(r)}>
                <TableCell><div className="flex items-center gap-3"><Avatar className="h-9 w-9"><AvatarFallback className="bg-muted text-xs font-semibold">{(r.name || "O").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.email}</div></div></div></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.city}</TableCell>
                <TableCell><Badge variant="secondary">{r.properties_count ?? 0}</Badge></TableCell>
                <TableCell>{r.verified ? <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</Badge> : <Badge variant="outline" className="text-muted-foreground">Unverified</Badge>}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">
                  {canEdit && <Button size="icon" variant="ghost" onClick={() => verify(r)} data-testid={`owner-verify-${r.id}`}>{r.verified ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4 text-primary" />}</Button>}
                  {canEdit && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(r.id)} data-testid={`owner-delete-${r.id}`}><Trash2 className="h-4 w-4" /></Button>}
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto amass-scroll" data-testid="owner-detail-dialog">
          {detail && <>
            <DialogHeader><DialogTitle className="font-heading">{detail.name}</DialogTitle><DialogDescription>{detail.email} · {detail.city}</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked Properties ({detailProps.length})</div>
              {detailProps.length === 0 && <p className="text-sm text-muted-foreground">No properties linked yet.</p>}
              {detailProps.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /><div><div className="text-sm font-medium">{p.title}</div><div className="text-xs text-muted-foreground">{p.city} · {money(p.price)}</div></div></div>
                  <Badge variant="outline" className="capitalize">{p.status}</Badge>
                </div>
              ))}
              {canEdit && <div className="pt-2 border-t border-border">
                <Label className="text-xs">Link a property to this owner</Label>
                <div className="flex gap-2 mt-1.5">
                  <Select value={linkId} onValueChange={setLinkId}><SelectTrigger data-testid="owner-link-select"><SelectValue placeholder="Choose unlinked property" /></SelectTrigger>
                    <SelectContent>{unowned.slice(0, 50).map((p) => <SelectItem key={p.id} value={p.id}>{p.title} · {p.city}</SelectItem>)}</SelectContent></Select>
                  <Button onClick={linkProperty} disabled={!linkId} data-testid="owner-link-button"><Link2 className="h-4 w-4 mr-1.5" /> Link</Button>
                </div>
              </div>}
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
