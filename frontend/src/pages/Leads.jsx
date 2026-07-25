import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import api, { API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Search, Download, Trash2, Eye, Inbox, Loader2, Mail, Phone } from "lucide-react";

const TYPE_LABELS = {
  agent: "Become an Agent", contact: "Contact Us", demo: "Book Demo",
  partner: "Partner with AMASS", property: "List Your Property",
  newsletter: "Newsletter", waitlist: "Waiting List",
};
const STATUS_STYLES = {
  New: "bg-primary/10 text-primary border-primary/20",
  Contacted: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30",
  Closed: "bg-muted text-muted-foreground border-border",
};

export default function Leads() {
  const { can } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/leads", { params: { search, type, status } });
      setLeads(data);
    } finally { setLoading(false); }
  }, [search, type, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const updateStatus = async (id, newStatus) => {
    await api.patch(`/leads/${id}/status`, { status: newStatus });
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
    if (selected?.id === id) setSelected({ ...selected, status: newStatus });
    toast.success(`Marked as ${newStatus}`);
  };

  const remove = async (id) => {
    await api.delete(`/leads/${id}`);
    setLeads((prev) => prev.filter((l) => l.id !== id));
    toast.success("Lead deleted");
  };

  const exportCsv = async () => {
    try {
      const res = await api.get("/leads-export/csv", { params: { type, status }, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = "amass_leads.csv"; a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Exported CSV");
    } catch { toast.error("Export failed"); }
  };

  const canEdit = can("leads", "edit");
  const canDelete = can("leads", "delete");

  return (
    <div className="space-y-6" data-testid="leads-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Lead Management</h1>
          <p className="text-muted-foreground text-sm mt-1">All website form submissions in one inbox.</p>
        </div>
        <Button onClick={exportCsv} variant="outline" data-testid="export-csv-button">
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card className="p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="leads-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, message..." className="pl-9" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full sm:w-52" data-testid="leads-type-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Form Types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-40" data-testid="leads-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="Contacted">Contacted</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto amass-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              )}
              {!loading && leads.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" /> No leads found.
                </TableCell></TableRow>
              )}
              {!loading && leads.map((l) => (
                <TableRow key={l.id} data-testid={`lead-row-${l.id}`} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground md:hidden">{TYPE_LABELS[l.type]}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{TYPE_LABELS[l.type]}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{l.email}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Select value={l.status} onValueChange={(v) => updateStatus(l.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs" data-testid={`lead-status-${l.id}`}>
                          <Badge variant="outline" className={STATUS_STYLES[l.status]}>{l.status}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Contacted">Contacted</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={STATUS_STYLES[l.status]}>{l.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setSelected(l)} data-testid={`lead-view-${l.id}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" data-testid={`lead-delete-${l.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(l.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid={`lead-delete-confirm-${l.id}`}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg" data-testid="lead-detail-dialog">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">{selected.name}</DialogTitle>
                <DialogDescription>{TYPE_LABELS[selected.type]} · {new Date(selected.created_at).toLocaleString()}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {selected.email}</div>
                {selected.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {selected.phone}</div>}
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Message</div>
                  <p className="rounded-lg bg-muted p-3">{selected.message || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Status</span>
                  <Badge variant="outline" className={STATUS_STYLES[selected.status]}>{selected.status}</Badge>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
