import { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, FileText } from "lucide-react";

export const FORM_TYPES = ["become_agent", "book_demo", "list_property", "contact", "partner", "waiting_list", "newsletter"];
const humanize = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function fillTemplate(body, lead, adminName) {
  return body
    .replace(/\{name\}/g, lead?.name || "there")
    .replace(/\{admin_name\}/g, adminName || "the AMASS team");
}

function TemplateEditor({ template, onClose, onSaved }) {
  const [form, setForm] = useState(template);
  const [saving, setSaving] = useState(false);
  const toggle = (t, on) => setForm((f) => ({ ...f, form_types: on ? [...f.form_types, t] : f.form_types.filter((x) => x !== t) }));
  const save = async () => {
    setSaving(true);
    try {
      const payload = { name: form.name, form_types: form.form_types, body: form.body };
      if (form.id) await api.put(`/website/reply-templates/${form.id}`, payload);
      else await api.post("/website/reply-templates", payload);
      toast.success("Template saved");
      onSaved();
      onClose();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="template-editor-dialog">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Use {"{name}"} for the lead's name. Your greeting and sign-off are added automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} data-testid="template-name-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Suggest for these forms</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORM_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.form_types.includes(t)} onCheckedChange={(c) => toggle(t, !!c)} data-testid={`template-formtype-${t}`} />
                  {humanize(t)}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={5000} className="min-h-[160px]" data-testid="template-body-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="template-cancel-button">Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name.trim() || !form.body.trim()} data-testid="template-save-button">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TemplatesManager({ templates, canEdit, onChanged }) {
  const [editing, setEditing] = useState(null);
  const remove = async (t) => {
    if (!window.confirm(`Delete the "${t.name}" template?`)) return;
    try {
      await api.delete(`/website/reply-templates/${t.id}`);
      toast.success("Template deleted");
      onChanged();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <Card className="p-4 space-y-4" data-testid="templates-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Ready-made replies admins can drop into the reply box and tweak before sending.</p>
        {canEdit && <Button size="sm" onClick={() => setEditing({ name: "", form_types: [], body: "" })} data-testid="template-add-button"><Plus className="h-4 w-4 mr-1.5" /> New template</Button>}
      </div>
      {templates.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground" data-testid="templates-empty">No templates yet.</div>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {templates.map((t) => (
          <div key={t.id} className="rounded-lg border border-border p-4 flex flex-col gap-2" data-testid={`template-card-${t.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> {t.name}</div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing({ ...t })} data-testid={`template-edit-${t.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(t)} data-testid={`template-delete-${t.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1">{t.form_types.map((f) => <Badge key={f} variant="secondary" className="text-[10px]">{humanize(f)}</Badge>)}</div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{t.body}</p>
          </div>
        ))}
      </div>
      {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </Card>
  );
}
