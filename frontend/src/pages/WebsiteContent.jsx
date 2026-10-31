import { useEffect, useState } from "react";
import { get, set, cloneDeep } from "lodash";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, ExternalLink, PenLine, RotateCcw } from "lucide-react";
import { ArrayEditor, ObjectEditor } from "@/pages/LandingCMS";

const SKIP = ["key", "updated_at", "_id", "sections"];
const humanize = (k) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function SectionToggles({ sections, onToggle, disabled }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Object.entries(sections || {}).map(([k, v]) => (
        <div key={k} className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm font-medium">{humanize(k)}</span>
          <Switch checked={!!v} onCheckedChange={(c) => onToggle(k, c)} disabled={disabled} data-testid={`website-section-toggle-${k}`} />
        </div>
      ))}
    </div>
  );
}

function TabBody({ k, value, handlers, disabled }) {
  if (Array.isArray(value)) return <ArrayEditor path={k} items={value} {...handlers} disabled={disabled} />;
  const scoped = {
    onChange: (p, v) => handlers.onChange(`${k}.${p}`, v),
    onArrayAdd: (p) => handlers.onArrayAdd(`${k}.${p}`),
    onArrayRemove: (p, i) => handlers.onArrayRemove(`${k}.${p}`, i),
  };
  return <ObjectEditor data={value} {...scoped} disabled={disabled} />;
}

export default function WebsiteContent() {
  const { can } = useAuth();
  const canEdit = can("cms", "edit");
  const [original, setOriginal] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data: d } = await api.get("/website/content");
      setOriginal(d); setData(cloneDeep(d)); setError("");
    } catch (e) { setError(formatApiError(e.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const handlers = {
    onChange: (path, val) => setData((p) => set(cloneDeep(p), path, val)),
    onArrayAdd: (path) => setData((p) => {
      const next = cloneDeep(p); const arr = get(next, path) || [];
      const t = arr.length ? arr[0] : "";
      arr.push(t && typeof t === "object" ? Object.fromEntries(Object.keys(t).map((x) => [x, ""])) : "");
      return set(next, path, arr);
    }),
    onArrayRemove: (path, idx) => setData((p) => { const next = cloneDeep(p); get(next, path).splice(idx, 1); return next; }),
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/website/content", data);
      toast.success("Saved — live on your website");
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  if (error) return <Card className="p-8 text-center text-sm text-destructive" data-testid="website-content-error">{error}</Card>;
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const keys = Object.keys(data).filter((k) => !SKIP.includes(k) && data[k] && typeof data[k] === "object");
  const dirty = JSON.stringify(data) !== JSON.stringify(original);

  return (
    <div className="space-y-6" data-testid="website-content-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2"><PenLine className="h-6 w-6 text-primary" /> Website Content</h1>
          <p className="text-muted-foreground text-sm mt-1">Edit your live AMASS landing page text and sections.{data.updated_at && ` Last saved ${new Date(data.updated_at).toLocaleString()}.`}</p>
        </div>
        <div className="flex gap-2">
          <a href="https://discover-properties-1.emergent.host" target="_blank" rel="noreferrer">
            <Button variant="outline" data-testid="website-open-site-button"><ExternalLink className="h-4 w-4 mr-2" /> Open website</Button>
          </a>
          {canEdit && <Button variant="ghost" onClick={() => setData(cloneDeep(original))} disabled={!dirty || saving} data-testid="website-content-reset-button"><RotateCcw className="h-4 w-4 mr-2" /> Discard</Button>}
          {canEdit && <Button onClick={save} disabled={!dirty || saving} data-testid="website-content-save-button">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save to website
          </Button>}
        </div>
      </div>
      <Tabs defaultValue={keys[0]}>
        <div className="overflow-x-auto amass-scroll pb-1">
          <TabsList className="inline-flex h-auto flex-nowrap">
            {keys.map((k) => <TabsTrigger key={k} value={k} className="whitespace-nowrap" data-testid={`website-content-tab-${k}`}>{humanize(k)}</TabsTrigger>)}
            {data.sections && <TabsTrigger value="sections" data-testid="website-content-tab-sections">Show / Hide Sections</TabsTrigger>}
          </TabsList>
        </div>
        {keys.map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            <Card className="p-6"><TabBody k={k} value={data[k]} handlers={handlers} disabled={!canEdit} /></Card>
          </TabsContent>
        ))}
        {data.sections && (
          <TabsContent value="sections" className="mt-4">
            <Card className="p-6">
              <SectionToggles sections={data.sections} onToggle={(k, v) => handlers.onChange(`sections.${k}`, v)} disabled={!canEdit} />
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
