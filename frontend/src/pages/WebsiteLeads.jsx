import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLeadAlerts } from "@/context/LeadAlertsContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Globe, Mail, Reply, Send } from "lucide-react";

const STATUSES = ["new", "contacted", "closed"];
const STATUS_STYLES = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};
const humanize = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

function StatCard({ label, value, testid }) {
  return (
    <Card className="p-4" data-testid={testid}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-heading text-2xl font-extrabold mt-1">{value ?? 0}</div>
    </Card>
  );
}

function StatusSelect({ lead, canEdit, onChange }) {
  const [busy, setBusy] = useState(false);
  const change = async (status) => {
    setBusy(true);
    await onChange(lead, status);
    setBusy(false);
  };
  if (!canEdit) return <Badge variant="outline" className={STATUS_STYLES[lead.status]}>{humanize(lead.status)}</Badge>;
  return (
    <Select value={lead.status} onValueChange={change} disabled={busy}>
      <SelectTrigger className={`h-8 w-32 text-xs ${STATUS_STYLES[lead.status] || ""}`} data-testid={`website-lead-status-${lead.id}`}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => <SelectItem key={s} value={s} data-testid={`website-lead-status-option-${s}`}>{humanize(s)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ReplyDialog({ lead, onClose, onSent }) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!lead) { return; }
    setMessage("");
    setHistory([]);
    api.get(`/website/leads/${lead.id}/replies`).then((r) => setHistory(r.data)).catch(() => setHistory([]));
  }, [lead]);
  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/website/leads/${lead.id}/reply`, { message });
      toast.success(`Reply sent to ${lead.email}`);
      onSent(lead, data.status);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setSending(false); }
  };
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="website-reply-dialog">
        <DialogHeader>
          <DialogTitle>Reply to {lead?.name || lead?.email}</DialogTitle>
          <DialogDescription data-testid="website-reply-to">
            To {lead?.email} · their answer goes to hello@amass.africa
          </DialogDescription>
        </DialogHeader>
        {lead?.message && <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">They wrote:</span> {lead.message}</div>}
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} placeholder="Write your reply…" className="min-h-[140px]" data-testid="website-reply-message" />
        {history.length > 0 && (
          <div className="space-y-2" data-testid="website-reply-history">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earlier replies</div>
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">{h.admin_name} · {fmtDate(h.sent_at)}</div>
                <div className="whitespace-pre-wrap">{h.message}</div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="website-reply-cancel">Cancel</Button>
          <Button onClick={send} disabled={!message.trim() || sending} data-testid="website-reply-send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Send reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadsTable({ rows, canEdit, onStatus, onReply, newSince, showType = true, testid }) {
  if (!rows.length) return <div className="py-14 text-center text-sm text-muted-foreground" data-testid={`${testid}-empty`}>Nothing here yet.</div>;
  return (
    <div className="overflow-x-auto amass-scroll" data-testid={testid}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
            <th className="py-3 px-3">Contact</th>
            {showType && <th className="py-3 px-3">Form</th>}
            <th className="py-3 px-3 hidden md:table-cell">Message</th>
            <th className="py-3 px-3">Received</th>
            <th className="py-3 px-3">Status</th>
            {canEdit && <th className="py-3 px-3" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors" data-testid={`website-lead-row-${l.id}`}>
              <td className="py-3 px-3">
                <div className="font-medium flex items-center gap-1.5">
                  {newSince && l.created_at > newSince && <span className="h-2 w-2 rounded-full bg-primary shrink-0" title="New since your last visit" data-testid={`website-lead-new-dot-${l.id}`} />}
                  {l.name || "—"}
                </div>
                <div className="text-xs text-muted-foreground">{l.email}{l.phone ? ` · ${l.phone}` : ""}</div>
              </td>
              {showType && <td className="py-3 px-3"><Badge variant="secondary">{humanize(l.form_type)}</Badge></td>}
              <td className="py-3 px-3 hidden md:table-cell max-w-xs truncate text-muted-foreground">{l.message || "—"}</td>
              <td className="py-3 px-3 whitespace-nowrap text-xs text-muted-foreground">{fmtDate(l.created_at)}</td>
              <td className="py-3 px-3"><StatusSelect lead={l} canEdit={canEdit} onChange={onStatus} /></td>
              {canEdit && (
                <td className="py-3 px-3">
                  {l.email && <Button size="sm" variant="outline" onClick={() => onReply(l)} data-testid={`website-lead-reply-${l.id}`}><Reply className="h-3.5 w-3.5 mr-1.5" /> Reply</Button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useWebsiteData() {
  const [state, setState] = useState({ stats: null, leads: [], newsletter: [], loading: true, error: "" });
  const load = async () => {
    try {
      const [s, l, n] = await Promise.all([api.get("/website/stats"), api.get("/website/leads"), api.get("/website/newsletter")]);
      setState({ stats: s.data, leads: l.data, newsletter: n.data, loading: false, error: "" });
    } catch (e) {
      setState((p) => ({ ...p, loading: false, error: formatApiError(e.response?.data?.detail) }));
    }
  };
  useEffect(() => { load(); }, []);
  return [state, setState];
}

export default function WebsiteLeads() {
  const { can } = useAuth();
  const canEdit = can("leads", "edit");
  const [{ stats, leads, newsletter, loading, error }, setState] = useWebsiteData();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [replyTo, setReplyTo] = useState(null);
  const [newSince, setNewSince] = useState(null);
  const { markSeen } = useLeadAlerts();

  useEffect(() => { markSeen().then((v) => v && setNewSince((p) => (p && p < v ? p : v))).catch(() => {}); }, [markSeen]);

  const onSent = (lead, next) => {
    const upd = (arr) => arr.map((x) => (x.id === lead.id ? { ...x, status: next } : x));
    setState((p) => ({ ...p, leads: upd(p.leads), newsletter: upd(p.newsletter) }));
  };

  const onStatus = async (lead, next) => {
    try {
      await api.patch(`/website/leads/${lead.id}`, { status: next });
      const upd = (arr) => arr.map((x) => (x.id === lead.id ? { ...x, status: next } : x));
      setState((p) => ({ ...p, leads: upd(p.leads), newsletter: upd(p.newsletter) }));
      toast.success(`Marked ${humanize(next)} on the website`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const types = useMemo(() => [...new Set(leads.map((l) => l.form_type))].sort(), [leads]);
  const filtered = useMemo(() => leads.filter((l) =>
    l.form_type !== "newsletter" &&
    (type === "all" || l.form_type === type) &&
    (status === "all" || l.status === status) &&
    (!q || `${l.name || ""} ${l.email || ""} ${l.phone || ""}`.toLowerCase().includes(q.toLowerCase()))
  ), [leads, q, type, status]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (error) return <Card className="p-8 text-center text-sm text-destructive" data-testid="website-leads-error">{error}</Card>;

  const counts = STATUSES.reduce((a, s) => ({ ...a, [s]: leads.filter((l) => l.form_type !== "newsletter" && l.status === s).length }), {});

  return (
    <div className="space-y-6" data-testid="website-leads-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2"><Globe className="h-6 w-6 text-primary" /> Website Leads</h1>
        <p className="text-muted-foreground text-sm mt-1">Live from your AMASS website. Status changes save straight to the site.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total submissions" value={stats?.total_leads} testid="website-stat-total" />
        <StatCard label="New" value={counts.new} testid="website-stat-new" />
        <StatCard label="Contacted" value={counts.contacted} testid="website-stat-contacted" />
        <StatCard label="Newsletter" value={newsletter.length} testid="website-stat-newsletter" />
      </div>
      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads" data-testid="website-tab-leads">Leads ({leads.length - newsletter.length})</TabsTrigger>
          <TabsTrigger value="newsletter" data-testid="website-tab-newsletter"><Mail className="h-3.5 w-3.5 mr-1.5" /> Newsletter ({newsletter.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="leads" className="mt-4">
          <Card className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" className="pl-9" data-testid="website-leads-search" />
              </div>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full sm:w-48" data-testid="website-leads-type-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All forms</SelectItem>
                  {types.filter((t) => t !== "newsletter").map((t) => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full sm:w-40" data-testid="website-leads-status-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <LeadsTable rows={filtered} canEdit={canEdit} onStatus={onStatus} onReply={setReplyTo} newSince={newSince} testid="website-leads-table" />
          </Card>
        </TabsContent>
        <TabsContent value="newsletter" className="mt-4">
          <Card className="p-4">
            <LeadsTable rows={newsletter} canEdit={canEdit} onStatus={onStatus} onReply={setReplyTo} newSince={newSince} showType={false} testid="website-newsletter-table" />
          </Card>
        </TabsContent>
      </Tabs>
      <ReplyDialog lead={replyTo} onClose={() => setReplyTo(null)} onSent={onSent} />
    </div>
  );
}
