import { useEffect, useState } from "react";
import { get, set, cloneDeep } from "lodash";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, Plus, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";

const LONG_KEYS = ["message", "description", "quote", "subheadline", "subtitle", "meta_description", "a", "tagline", "features", "cities", "tags"];

function humanize(k) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function FieldEditor({ path, value, onChange, disabled }) {
  const key = path.split(".").pop().replace(/\[\d+\]$/, "");
  const isLong = LONG_KEYS.includes(key) || (typeof value === "string" && value.length > 70);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{humanize(key)}</Label>
      {isLong ? (
        <Textarea value={value} disabled={disabled} onChange={(e) => onChange(path, e.target.value)} className="min-h-[70px]" data-testid={`cms-field-${path}`} />
      ) : (
        <Input value={value} disabled={disabled} onChange={(e) => onChange(path, e.target.value)} data-testid={`cms-field-${path}`} />
      )}
    </div>
  );
}

function ArrayEditor({ path, items, onChange, onArrayAdd, onArrayRemove, disabled }) {
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="rounded-lg border border-border p-4 relative bg-muted/30">
          {!disabled && (
            <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7 text-destructive" onClick={() => onArrayRemove(path, idx)} data-testid={`cms-remove-${path}-${idx}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <div className="grid sm:grid-cols-2 gap-3 pr-8">
            {item && typeof item === "object"
              ? Object.entries(item).map(([k, v]) => (
                  <FieldEditor key={k} path={`${path}[${idx}].${k}`} value={v} onChange={onChange} disabled={disabled} />
                ))
              : <FieldEditor path={`${path}[${idx}]`} value={item} onChange={onChange} disabled={disabled} />}
          </div>
        </div>
      ))}
      {!disabled && (
        <Button variant="outline" size="sm" onClick={() => onArrayAdd(path)} data-testid={`cms-add-${path}`}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Item
        </Button>
      )}
    </div>
  );
}

function ObjectEditor({ data, onChange, onArrayAdd, onArrayRemove, disabled }) {
  const entries = Object.entries(data || {});
  const scalars = entries.filter(([, v]) => !(v && typeof v === "object"));
  const arrays = entries.filter(([, v]) => v && typeof v === "object");
  return (
    <div className="space-y-5">
      {scalars.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {scalars.map(([k, v]) => (
            <FieldEditor key={k} path={k} value={v} onChange={onChange} disabled={disabled} />
          ))}
        </div>
      )}
      {arrays.map(([k, v]) => (
        <div key={k} className="space-y-2.5 rounded-lg border border-border/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">{humanize(k)}</div>
          <ArrayEditor
            path={k}
            items={Array.isArray(v) ? v : [v]}
            onChange={onChange} onArrayAdd={onArrayAdd} onArrayRemove={onArrayRemove} disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

function SectionForm({ section, onSaved, canEdit }) {
  const [data, setData] = useState(cloneDeep(section.data));
  const [visible, setVisible] = useState(section.visible);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setData(cloneDeep(section.data)); setVisible(section.visible); }, [section]);

  const onChange = (path, val) => setData((prev) => set(cloneDeep(prev), path, val));

  const onArrayAdd = (path) => setData((prev) => {
    const next = cloneDeep(prev);
    const arr = get(next, path) || [];
    const template = arr.length ? cloneDeep(arr[0]) : "";
    const blank = typeof template === "object"
      ? Object.fromEntries(Object.keys(template).map((k) => [k, ""])) : "";
    arr.push(blank); set(next, path, arr); return next;
  });

  const onArrayRemove = (path, idx) => setData((prev) => {
    const next = cloneDeep(prev);
    const arr = get(next, path);
    arr.splice(idx, 1); set(next, path, arr); return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/cms/sections/${section.key}`, { data, visible });
      toast.success(`${section.title} saved — live on landing page`);
      onSaved();
    } catch { toast.error("Save failed"); } finally { setSaving(false); }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
        <div>
          <h2 className="font-heading text-lg font-bold tracking-tight">{section.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Changes reflect immediately on the live landing page.</p>
        </div>
        <div className="flex items-center gap-2">
          {visible ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">{visible ? "Visible" : "Hidden"}</span>
          <Switch checked={visible} onCheckedChange={setVisible} disabled={!canEdit} data-testid={`cms-visibility-${section.key}`} />
        </div>
      </div>
      <div className="space-y-4">
        <ObjectEditor data={data} onChange={onChange} onArrayAdd={onArrayAdd} onArrayRemove={onArrayRemove} disabled={!canEdit} />
      </div>
      {canEdit && (
        <div className="mt-6 pt-4 border-t border-border flex justify-end">
          <Button onClick={save} disabled={saving} data-testid={`cms-save-${section.key}`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save Changes
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function LandingCMS() {
  const { can } = useAuth();
  const [sections, setSections] = useState([]);
  const [active, setActive] = useState("");
  const [loading, setLoading] = useState(true);
  const canEdit = can("cms", "edit");

  const load = async () => {
    const { data } = await api.get("/cms/sections");
    setSections(data);
    if (!active && data.length) setActive(data[0].key);
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const current = sections.find((s) => s.key === active);

  return (
    <div className="space-y-6" data-testid="cms-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Landing Page CMS</h1>
          <p className="text-muted-foreground text-sm mt-1">Database-driven content — edit without touching code.</p>
        </div>
        <a href={`${process.env.REACT_APP_BACKEND_URL}/api/public/landing`} target="_blank" rel="noreferrer">
          <Button variant="outline" data-testid="cms-preview-button"><ExternalLink className="h-4 w-4 mr-2" /> Preview Live Data</Button>
        </a>
      </div>

      <Tabs value={active} onValueChange={setActive}>
        <div className="overflow-x-auto amass-scroll pb-1">
          <TabsList className="inline-flex h-auto flex-nowrap">
            {sections.map((s) => (
              <TabsTrigger key={s.key} value={s.key} data-testid={`cms-tab-${s.key}`} className="whitespace-nowrap">
                {s.title}
                {!s.visible && <Badge variant="secondary" className="ml-1.5 text-[9px] px-1">hidden</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {current && (
          <TabsContent value={active} className="mt-4">
            <SectionForm section={current} onSaved={load} canEdit={canEdit} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
