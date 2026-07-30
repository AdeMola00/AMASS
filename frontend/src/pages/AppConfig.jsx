import { useEffect, useState } from "react";
import { cloneDeep } from "lodash";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";

const TITLES = {
  homepage_sections: "Homepage Sections", map_settings: "Map Settings",
  marketplace_config: "Marketplace Config", app_banners: "App Banners",
  notifications: "Notifications", featured_properties: "Featured Properties",
};

function humanize(k) { return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

function Field({ k, val, onChange }) {
  if (typeof val === "boolean")
    return <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><Label className="text-sm">{humanize(k)}</Label><Switch checked={val} onCheckedChange={(v) => onChange(v)} data-testid={`cfg-${k}`} /></div>;
  const long = typeof val === "string" && (val.length > 60 || k === "announcement");
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{humanize(k)}</Label>
      {long ? <Textarea value={val} onChange={(e) => onChange(e.target.value)} data-testid={`cfg-${k}`} />
            : <Input value={val} type={typeof val === "number" ? "number" : "text"}
                     onChange={(e) => onChange(typeof val === "number" ? Number(e.target.value) : e.target.value)} data-testid={`cfg-${k}`} />}
    </div>
  );
}

function SectionEditor({ section, canEdit, onSaved }) {
  const [data, setData] = useState(cloneDeep(section.data));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setData(cloneDeep(section.data)); }, [section]);

  const setScalar = (k, v) => setData((p) => ({ ...p, [k]: v }));
  const setArrayItem = (arrKey, idx, field, v) => setData((p) => {
    const n = cloneDeep(p); n[arrKey][idx][field] = v; return n;
  });

  const scalars = Object.entries(data).filter(([, v]) => typeof v !== "object");
  const arrays = Object.entries(data).filter(([, v]) => Array.isArray(v));

  const save = async () => {
    setSaving(true);
    try { await api.put(`/app-config/${section.key}`, { data }); toast.success(`${TITLES[section.key] || section.key} saved — live in the app`); onSaved(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setSaving(false); }
  };

  return (
    <Card className="p-6 space-y-5">
      {scalars.length > 0 && <div className="grid sm:grid-cols-2 gap-3">
        {scalars.map(([k, v]) => <Field key={k} k={k} val={v} onChange={(nv) => setScalar(k, nv)} />)}
      </div>}
      {arrays.map(([arrKey, arr]) => (
        <div key={arrKey} className="space-y-2.5 rounded-lg border border-border/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">{humanize(arrKey)}</div>
          {arr.map((item, idx) => (
            <div key={idx} className="grid sm:grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3">
              {Object.entries(item).map(([f, v]) => (
                <Field key={f} k={f} val={v} onChange={(nv) => setArrayItem(arrKey, idx, f, nv)} />
              ))}
            </div>
          ))}
        </div>
      ))}
      {canEdit && <div className="flex justify-end pt-2"><Button onClick={save} disabled={saving} data-testid={`cfg-save-${section.key}`}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save</Button></div>}
    </Card>
  );
}

export default function AppConfig() {
  const { can } = useAuth();
  const [sections, setSections] = useState([]);
  const [active, setActive] = useState("");
  const [loading, setLoading] = useState(true);
  const canEdit = can("app_config", "edit");
  const load = async () => { const { data } = await api.get("/app-config"); setSections(data); if (!active && data.length) setActive(data[0].key); setLoading(false); };
  useEffect(() => { load(); }, []); // eslint-disable-line

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const current = sections.find((s) => s.key === active);

  return (
    <div className="space-y-6" data-testid="app-config-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">App Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">Control the mobile app homepage, map, marketplace, banners & notifications — no code changes.</p>
      </div>
      <Tabs value={active} onValueChange={setActive}>
        <div className="overflow-x-auto amass-scroll pb-1">
          <TabsList className="inline-flex flex-nowrap">
            {sections.map((s) => <TabsTrigger key={s.key} value={s.key} data-testid={`cfg-tab-${s.key}`} className="whitespace-nowrap">{TITLES[s.key] || s.key}</TabsTrigger>)}
          </TabsList>
        </div>
        {current && <TabsContent value={active} className="mt-4"><SectionEditor section={current} canEdit={canEdit} onSaved={load} /></TabsContent>}
      </Tabs>
    </div>
  );
}
