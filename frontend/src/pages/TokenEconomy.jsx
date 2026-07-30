import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Coins, Repeat, Gift, Wallet, Plus, Trash2, Minus, Loader2, Search } from "lucide-react";

function BundlesTab({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", tokens: "", price: "", bonus: "" });
  const load = () => api.get("/tokens/bundles").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => { try { await api.post("/tokens/bundles", { ...form, tokens: Number(form.tokens) || 0, price: Number(form.price) || 0, bonus: Number(form.bonus) || 0 }); toast.success("Bundle added"); setOpen(false); setForm({ name: "", tokens: "", price: "", bonus: "" }); load(); } catch { toast.error("Failed"); } };
  const del = async (id) => { await api.delete(`/tokens/bundles/${id}`); toast.success("Deleted"); load(); };
  return (
    <div className="space-y-4">
      {canEdit && <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button data-testid="add-bundle-button"><Plus className="h-4 w-4 mr-2" /> New Bundle</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">New Token Bundle</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="bundle-name" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Tokens</Label><Input type="number" value={form.tokens} onChange={(e) => setForm({ ...form, tokens: e.target.value })} data-testid="bundle-tokens" /></div>
              <div className="space-y-1.5"><Label>Price ₦</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Bonus</Label><Input type="number" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={create} disabled={!form.name} data-testid="bundle-create">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((b) => (
          <Card key={b.id} className="p-5" data-testid={`bundle-${b.id}`}>
            <div className="flex items-center justify-between">
              <span className="font-heading font-bold">{b.name}</span>
              {canEdit && <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => del(b.id)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
            <div className="mt-3 flex items-baseline gap-1"><span className="text-3xl font-extrabold font-heading">{b.tokens}</span><span className="text-sm text-muted-foreground">tokens</span></div>
            {b.bonus > 0 && <Badge variant="outline" className="mt-1 text-emerald-600 border-emerald-500/30">+{b.bonus} bonus</Badge>}
            <div className="mt-3 text-primary font-semibold">₦{(b.price || 0).toLocaleString()}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlansTab({ canEdit }) {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/tokens/plans").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const del = async (id) => { await api.delete(`/tokens/plans/${id}`); toast.success("Deleted"); load(); };
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((p) => (
        <Card key={p.id} className="p-5" data-testid={`plan-${p.id}`}>
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold">{p.name}</span>
            {canEdit && <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => del(p.id)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
          <div className="mt-2 text-2xl font-extrabold font-heading">₦{(p.price || 0).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/{p.interval}</span></div>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{(p.features || []).map((f, i) => <li key={i}>• {f}</li>)}</ul>
        </Card>
      ))}
    </div>
  );
}

function RewardsTab({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ action: "", tokens: "" });
  const load = () => api.get("/tokens/rewards").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => { try { await api.post("/tokens/rewards", { ...form, tokens: Number(form.tokens) || 0, active: true }); toast.success("Reward added"); setOpen(false); setForm({ action: "", tokens: "" }); load(); } catch { toast.error("Failed"); } };
  const del = async (id) => { await api.delete(`/tokens/rewards/${id}`); toast.success("Deleted"); load(); };
  return (
    <div className="space-y-4">
      {canEdit && <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button data-testid="add-reward-button"><Plus className="h-4 w-4 mr-2" /> New Reward</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">New Reward</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Action</Label><Input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} data-testid="reward-action" /></div>
            <div className="space-y-1.5"><Label>Tokens</Label><Input type="number" value={form.tokens} onChange={(e) => setForm({ ...form, tokens: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={create} disabled={!form.action} data-testid="reward-create">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id} className="p-4 flex items-center justify-between" data-testid={`reward-${r.id}`}>
            <span className="font-medium">{r.action}</span>
            <div className="flex items-center gap-3"><Badge className="bg-primary/10 text-primary border-primary/20" variant="outline">+{r.tokens} tokens</Badge>
              {canEdit && <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function WalletsTab({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const load = () => api.get("/tokens/wallets", { params: { search } }).then((r) => setRows(r.data));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [search]); // eslint-disable-line
  const adjust = async (w, amount) => { await api.patch(`/tokens/wallets/${w.id}`, { amount, reason: "manual adjustment" }); load(); toast.success(`${amount > 0 ? "+" : ""}${amount} tokens`); };
  return (
    <div className="space-y-4">
      <Card className="p-4"><div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user..." className="pl-9" data-testid="wallet-search" /></div></Card>
      <Card className="overflow-hidden"><div className="overflow-x-auto amass-scroll">
        <Table>
          <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Balance</TableHead><TableHead className="text-right">Adjust</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((w) => (
              <TableRow key={w.id} data-testid={`wallet-${w.id}`}>
                <TableCell className="font-medium">{w.user_name}</TableCell>
                <TableCell><span className="font-heading font-bold">{w.balance}</span> <span className="text-xs text-muted-foreground">tokens</span></TableCell>
                <TableCell className="text-right">{canEdit && <div className="inline-flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => adjust(w, -10)}><Minus className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => adjust(w, 10)} data-testid={`wallet-add-${w.id}`}><Plus className="h-4 w-4" /></Button>
                </div>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></Card>
    </div>
  );
}

export default function TokenEconomy() {
  const { can } = useAuth();
  const canEdit = can("tokens", "edit");
  return (
    <div className="space-y-6" data-testid="tokens-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Token Economy</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage token bundles, subscription plans, rewards and user wallets.</p>
      </div>
      <Tabs defaultValue="bundles">
        <TabsList>
          <TabsTrigger value="bundles" data-testid="tok-tab-bundles"><Coins className="h-4 w-4 mr-1.5" /> Bundles</TabsTrigger>
          <TabsTrigger value="plans" data-testid="tok-tab-plans"><Repeat className="h-4 w-4 mr-1.5" /> Plans</TabsTrigger>
          <TabsTrigger value="rewards" data-testid="tok-tab-rewards"><Gift className="h-4 w-4 mr-1.5" /> Rewards</TabsTrigger>
          <TabsTrigger value="wallets" data-testid="tok-tab-wallets"><Wallet className="h-4 w-4 mr-1.5" /> Wallets</TabsTrigger>
        </TabsList>
        <TabsContent value="bundles" className="mt-4"><BundlesTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="plans" className="mt-4"><PlansTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="rewards" className="mt-4"><RewardsTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="wallets" className="mt-4"><WalletsTab canEdit={canEdit} /></TabsContent>
      </Tabs>
    </div>
  );
}
