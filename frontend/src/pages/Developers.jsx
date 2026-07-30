import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Briefcase, Building2, CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";

const CITIES = ["Lagos", "Abuja", "Accra", "Nairobi", "Kigali", "Cape Town"];
const PSTATUS = ["planning", "selling", "sold_out", "completed"];
const money = (p) => (p >= 1000000 ? `₦${(p / 1e6).toLocaleString()}M` : `₦${(p || 0).toLocaleString()}`);
const PS_STYLE = { selling: "text-emerald-600 border-emerald-500/30", planning: "text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30", sold_out: "text-muted-foreground", completed: "text-blue-500 border-blue-500/30" };

function DevelopersTab({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", city: "Lagos" });
  const load = () => api.get("/developers").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => { try { await api.post("/developers", form); toast.success("Developer added"); setOpen(false); setForm({ name: "", company: "", email: "", phone: "", city: "Lagos" }); load(); } catch { toast.error("Failed"); } };
  const verify = async (r) => { await api.patch(`/developers/${r.id}/verify`, { verified: !r.verified }); load(); };
  const del = async (id) => { await api.delete(`/developers/${id}`); toast.success("Removed"); load(); };
  return (
    <div className="space-y-4">
      {canEdit && <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button data-testid="add-developer-button"><Plus className="h-4 w-4 mr-2" /> Add Developer</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Add Developer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Company / Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, company: e.target.value })} data-testid="developer-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>City</Label><Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button onClick={create} disabled={!form.name} data-testid="developer-create">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      <Card className="overflow-hidden"><div className="overflow-x-auto amass-scroll">
        <Table>
          <TableHeader><TableRow><TableHead>Developer</TableHead><TableHead className="hidden md:table-cell">City</TableHead><TableHead>Projects</TableHead><TableHead>Verified</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-14 text-muted-foreground"><Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" /> No developers.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`developer-row-${r.id}`}>
                <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.email}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.city}</TableCell>
                <TableCell><Badge variant="secondary">{r.projects_count ?? 0}</Badge></TableCell>
                <TableCell>{r.verified ? <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</Badge> : <Badge variant="outline" className="text-muted-foreground">Unverified</Badge>}</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-1">
                  {canEdit && <Button size="icon" variant="ghost" onClick={() => verify(r)} data-testid={`developer-verify-${r.id}`}>{r.verified ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4 text-primary" />}</Button>}
                  {canEdit && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(r.id)} data-testid={`developer-delete-${r.id}`}><Trash2 className="h-4 w-4" /></Button>}
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></Card>
    </div>
  );
}

function ProjectsTab({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [devs, setDevs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ developer_id: "", name: "", city: "Lagos", units: "", price_from: "", status: "planning", completion_date: "" });
  const load = () => api.get("/developers/projects").then((r) => setRows(r.data));
  useEffect(() => { load(); api.get("/developers").then((r) => setDevs(r.data)); }, []);
  const create = async () => { try { await api.post("/developers/projects", { ...form, units: Number(form.units) || 0, price_from: Number(form.price_from) || 0 }); toast.success("Project added"); setOpen(false); setForm({ developer_id: "", name: "", city: "Lagos", units: "", price_from: "", status: "planning", completion_date: "" }); load(); } catch { toast.error("Failed"); } };
  const del = async (id) => { await api.delete(`/developers/projects/${id}`); toast.success("Removed"); load(); };
  return (
    <div className="space-y-4">
      {canEdit && <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button data-testid="add-project-button"><Plus className="h-4 w-4 mr-2" /> New Project</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">New Off-Plan Project</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Project Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="project-name" /></div>
            <div className="space-y-1.5"><Label>Developer</Label><Select value={form.developer_id} onValueChange={(v) => setForm({ ...form, developer_id: v })}><SelectTrigger data-testid="project-developer"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{devs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>City</Label><Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PSTATUS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Units</Label><Input type="number" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>From ₦</Label><Input type="number" value={form.price_from} onChange={(e) => setForm({ ...form, price_from: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Completion</Label><Input value={form.completion_date} onChange={(e) => setForm({ ...form, completion_date: e.target.value })} placeholder="Q4 2027" /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={create} disabled={!form.name} data-testid="project-create">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      <Card className="overflow-hidden"><div className="overflow-x-auto amass-scroll">
        <Table>
          <TableHeader><TableRow><TableHead>Project</TableHead><TableHead className="hidden md:table-cell">Developer</TableHead><TableHead>Units</TableHead><TableHead>From</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-14 text-muted-foreground"><Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" /> No projects.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`project-row-${r.id}`}>
                <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.city} · {r.completion_date}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.developer_name || "—"}</TableCell>
                <TableCell>{r.units}</TableCell>
                <TableCell className="font-medium">{money(r.price_from)}</TableCell>
                <TableCell><Badge variant="outline" className={`capitalize ${PS_STYLE[r.status] || ""}`}>{r.status.replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-right">{canEdit && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(r.id)} data-testid={`project-delete-${r.id}`}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></Card>
    </div>
  );
}

export default function Developers() {
  const { can } = useAuth();
  const canEdit = can("developers", "edit");
  return (
    <div className="space-y-6" data-testid="developers-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Developers</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage real-estate developers and their off-plan project pipelines.</p>
      </div>
      <Tabs defaultValue="developers">
        <TabsList>
          <TabsTrigger value="developers" data-testid="dev-tab-developers"><Briefcase className="h-4 w-4 mr-1.5" /> Developers</TabsTrigger>
          <TabsTrigger value="projects" data-testid="dev-tab-projects"><Building2 className="h-4 w-4 mr-1.5" /> Projects</TabsTrigger>
        </TabsList>
        <TabsContent value="developers" className="mt-4"><DevelopersTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="projects" className="mt-4"><ProjectsTab canEdit={canEdit} /></TabsContent>
      </Tabs>
    </div>
  );
}
