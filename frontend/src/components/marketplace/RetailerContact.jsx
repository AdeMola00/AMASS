import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Save, Send } from "lucide-react";

const when = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : null);

export function RetailerContact({ retailer, canEdit, contact, lastReminder, onChanged }) {
  const [email, setEmail] = useState(contact?.email || "");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => { setEmail(contact?.email || ""); }, [contact]);
  const dirty = (email.trim() || null) !== (contact?.email || null);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/retailers/contact", { retailer_id: retailer.id, retailer_name: retailer.name, email: email.trim() || null });
      toast.success(email.trim() ? "Contact email saved" : "Contact email removed");
      onChanged();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/retailers/restock-reminder", { retailer_id: retailer.id });
      toast.success(`Reminder sent to ${data.to} (${data.products} products)`);
      onChanged();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setSending(false); }
  };

  return (
    <Card className="p-5 space-y-3" data-testid="retailer-contact-card">
      <div className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-primary" /> Restock reminders</div>
      <p className="text-sm text-muted-foreground">
        Every Monday at 9:00 am Lagos time this contact gets a list of their out-of-stock products. No email, no reminder.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="retailer@example.com" disabled={!canEdit} className="flex-1" data-testid="retailer-contact-email-input" />
        {canEdit && (
          <Button onClick={save} disabled={!dirty || saving} data-testid="retailer-contact-save-button">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save
          </Button>
        )}
        {canEdit && contact?.email && (
          <Button variant="outline" onClick={send} disabled={sending || dirty || retailer.out_of_stock.length === 0} data-testid="retailer-send-reminder-button">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Send reminder now
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="retailer-last-reminder">
        {lastReminder ? `Last reminder ${when(lastReminder.sent_at)} to ${lastReminder.to} (${lastReminder.products} products)` : "No reminder sent yet"}
      </p>
    </Card>
  );
}
