import React, { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Megaphone } from "lucide-react";

export function AdminNotifications() {
  const [form, setForm] = useState({ title: "", body: "", audience: "all", city: "", action_url: "" });
  const [busy, setBusy] = useState(false);
  const [lastCount, setLastCount] = useState(null);

  const send = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    if (!window.confirm(`Send this to all ${form.audience} users${form.city ? " in " + form.city : ""}?`)) return;
    setBusy(true);
    try {
      const res = await api.admin.broadcast(form);
      setLastCount(res.recipients);
      toast.success(`Delivered to ${res.recipients} user${res.recipients === 1 ? "" : "s"}`);
      setForm({ title: "", body: "", audience: "all", city: "", action_url: "" });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-notifications">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">Notifications</div>
        <h1 className="font-display text-4xl">Broadcast a message</h1>
        <p className="mt-2 text-neutral-500">Send an in-app notification to a segment of users. Delivered instantly on web and mobile.</p>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={send} className="bg-white rounded-2xl border border-neutral-200 p-6 amass-shadow-card space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5" data-testid="broadcast-title" required />
          </div>
          <div>
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="mt-1.5" data-testid="broadcast-body" required />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Audience</Label>
              <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                <SelectTrigger className="mt-1.5" data-testid="broadcast-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  <SelectItem value="customers">Customers only</SelectItem>
                  <SelectItem value="agents">Agents only</SelectItem>
                  <SelectItem value="admin">Admins only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="city">City filter (optional)</Label>
              <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Lagos" className="mt-1.5" />
            </div>
          </div>
          <div>
            <Label htmlFor="action_url">Action URL (optional)</Label>
            <Input id="action_url" value={form.action_url} onChange={(e) => setForm({ ...form, action_url: e.target.value })} placeholder="/properties?city=Lagos" className="mt-1.5" />
          </div>
          <Button type="submit" disabled={busy} className="w-full amass-btn-red rounded-full h-11" data-testid="broadcast-send">
            <Send size={14} className="mr-2" /> {busy ? "Sending…" : "Send broadcast"}
          </Button>
        </form>

        {lastCount !== null && (
          <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800" data-testid="last-broadcast">
            <Megaphone size={16} />
            <div className="text-sm">Last broadcast reached <strong>{lastCount}</strong> users.</div>
          </div>
        )}
      </div>
    </div>
  );
}
