import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bell, Send, Trash2, Smartphone, Mail, MessageSquare, Megaphone, Loader2 } from "lucide-react";

const CHANNELS = [
  { key: "in_app", label: "In-App", icon: Megaphone, note: "Delivered live" },
  { key: "push", label: "Push", icon: Smartphone, note: "Queued" },
  { key: "email", label: "Email", icon: Mail, note: "Queued" },
  { key: "sms", label: "SMS", icon: MessageSquare, note: "Queued" },
];
const CH_STATUS = { sent: "text-emerald-600 border-emerald-500/30", queued: "text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30" };

export default function Notifications() {
  const { can } = useAuth();
  const canCreate = can("notifications", "create");
  const canEdit = can("notifications", "edit");
  const canDelete = can("notifications", "delete");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", audience: "all", channels: ["in_app"] });

  const load = () => api.get("/notifications").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const toggleChannel = (k) => setForm((f) => ({
    ...f, channels: f.channels.includes(k) ? f.channels.filter((c) => c !== k) : [...f.channels, k],
  }));

  const send = async () => {
    if (!form.title || !form.message || form.channels.length === 0) return;
    setBusy(true);
    try {
      await api.post("/notifications", form);
      toast.success("Broadcast sent");
      setForm({ title: "", message: "", audience: "all", channels: ["in_app"] });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const toggle = async (id) => { await api.patch(`/notifications/${id}/toggle`); load(); };
  const del = async (id) => { await api.delete(`/notifications/${id}`); toast.success("Deleted"); load(); };

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground text-sm mt-1">Broadcast announcements to app users. In-app delivers instantly; push/email/SMS are queued until a provider is connected.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {canCreate && (
          <Card className="p-6 lg:col-span-2 space-y-4 h-fit">
            <h3 className="font-heading font-semibold flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> New Broadcast</h3>
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="notif-title" /></div>
            <div className="space-y-1.5"><Label>Message</Label><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="min-h-[90px]" data-testid="notif-message" /></div>
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                <SelectTrigger data-testid="notif-audience"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="agents">Agents</SelectItem>
                  <SelectItem value="buyers">Buyers</SelectItem>
                  <SelectItem value="developers">Developers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="grid grid-cols-2 gap-2">
                {CHANNELS.map((c) => (
                  <button key={c.key} type="button" onClick={() => toggleChannel(c.key)} data-testid={`notif-channel-${c.key}`}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${form.channels.includes(c.key) ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    <c.icon className="h-4 w-4" /><span className="flex-1 text-left">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={send} disabled={busy || !form.title || !form.message} className="w-full" data-testid="notif-send">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Send Broadcast
            </Button>
          </Card>
        )}

        <div className={canCreate ? "lg:col-span-3 space-y-3" : "lg:col-span-5 space-y-3"}>
          <h3 className="font-heading font-semibold text-sm">History</h3>
          {rows.length === 0 && <Card className="p-10 text-center text-muted-foreground"><Bell className="h-8 w-8 mx-auto mb-2 opacity-40" /> No broadcasts yet.</Card>}
          {rows.map((n) => (
            <Card key={n.id} className="p-4" data-testid={`notif-${n.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{n.title}</div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge variant="secondary" className="text-[10px] capitalize">{n.audience}</Badge>
                    {Object.entries(n.channel_status || {}).map(([ch, st]) => (
                      <Badge key={ch} variant="outline" className={`text-[10px] capitalize ${CH_STATUS[st] || ""}`}>{ch.replace("_", "-")}: {st}</Badge>
                    ))}
                    <span className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {n.channels?.includes("in_app") && canEdit && (
                    <div className="flex items-center gap-1.5" title="Show in app">
                      <Switch checked={n.active} onCheckedChange={() => toggle(n.id)} data-testid={`notif-toggle-${n.id}`} />
                    </div>
                  )}
                  {canDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive h-8 w-8" data-testid={`notif-delete-${n.id}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete broadcast?</AlertDialogTitle><AlertDialogDescription>This removes it from history and the app.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del(n.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
