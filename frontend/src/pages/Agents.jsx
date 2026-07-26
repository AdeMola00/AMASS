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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Search, Loader2, UserCog, Trash2, Plus, CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";

const CITIES = ["Lagos", "Abuja", "Accra", "Nairobi", "Kigali", "Cape Town"];

export default function Agents() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ search: "", city: "all", verified: "all" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "Lagos", agency: "" });
  const [busy, setBusy] = useState(false);
  const canEdit = can("agents", "edit");
  const canDelete = can("agents", "delete");
  const canCreate = can("agents", "create");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search: f.search, city: f.city };
      if (f.verified !== "all") params.verified = f.verified;
      const { data } = await api.get("/agents", { params });
      setRows(data);
    } finally { setLoading(false); }
  }, [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const toggleVerify = async (r) => {
    await api.patch(`/agents/${r.id}/verify`, { verified: !r.verified });
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, verified: !r.verified } : x)));
    toast.success(!r.verified ? "Agent verified" : "Verification removed");
  };
  const remove = async (id) => { await api.delete(`/agents/${id}`); setRows((p) => p.filter((x) => x.id !== id)); toast.success("Agent removed"); };
  const create = async () => {
    setBusy(true);
    try { await api.post("/agents", form); toast.success("Agent added"); setOpen(false); load(); setForm({ name: "", email: "", phone: "", city: "Lagos", agency: "" }); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="agents-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Agents</h1>
          <p className="text-muted-foreground text-sm mt-1">Onboard and verify AMASS agents.</p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-agent-button"><Plus className="h-4 w-4 mr-2" /> Add Agent</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-heading">Add Agent</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Full Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="agent-name" /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="agent-email" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>City</Label>
                    <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-1.5"><Label>Agency</Label><Input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={create} disabled={busy || !form.name || !form.email} data-testid="agent-create">{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Add Agent</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="agent-search" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} placeholder="Search name, email, agency..." className="pl-9" />
        </div>
        <Select value={f.city} onValueChange={(v) => setF({ ...f, city: v })}><SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Cities</SelectItem>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={f.verified} onValueChange={(v) => setF({ ...f, verified: v })}><SelectTrigger className="sm:w-40" data-testid="agent-filter-verified"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="true">Verified</SelectItem><SelectItem value="false">Unverified</SelectItem></SelectContent></Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto amass-scroll">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Agent</TableHead>
              <TableHead className="hidden md:table-cell">Agency</TableHead>
              <TableHead className="hidden lg:table-cell">City</TableHead>
              <TableHead>Listings</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-16 text-muted-foreground"><UserCog className="h-8 w-8 mx-auto mb-2 opacity-40" /> No agents found.</TableCell></TableRow>}
              {!loading && rows.map((r) => (
                <TableRow key={r.id} data-testid={`agent-row-${r.id}`} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9"><AvatarFallback className="bg-muted text-xs font-semibold">{(r.name || "A").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div className="min-w-0"><div className="font-medium truncate">{r.name}</div><div className="text-xs text-muted-foreground truncate">{r.email}</div></div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.agency || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{r.city}</TableCell>
                  <TableCell><Badge variant="secondary">{r.listings_count ?? 0}</Badge></TableCell>
                  <TableCell>
                    {r.verified ? <Badge variant="outline" className="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</Badge>
                                : <Badge variant="outline" className="text-muted-foreground">Unverified</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && <Button size="icon" variant="ghost" onClick={() => toggleVerify(r)} data-testid={`agent-verify-${r.id}`}>{r.verified ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4 text-primary" />}</Button>}
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive" data-testid={`agent-delete-${r.id}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Remove {r.name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(r.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction></AlertDialogFooter>
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
