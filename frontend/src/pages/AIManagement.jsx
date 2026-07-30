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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Calculator, PenLine, LineChart, Loader2, Copy } from "lucide-react";

const CITIES = ["Lagos", "Abuja", "Accra", "Nairobi", "Kigali", "Cape Town"];
const TYPES = ["Apartment", "Duplex", "Penthouse", "Terrace", "Detached", "Studio", "Land", "Commercial"];

function ResultPanel({ text, loading }) {
  if (loading) return <Card className="p-6 flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></Card>;
  if (!text) return <Card className="p-6 h-40 flex items-center justify-center text-sm text-muted-foreground border-dashed">AI output will appear here.</Card>;
  return (
    <Card className="p-5" data-testid="ai-result">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> AMASS AI</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /></Button>
      </div>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
    </Card>
  );
}

function PropertyForm({ endpoint, cta, canUse, onResult }) {
  const [f, setF] = useState({ title: "", type: "Apartment", listing: "Sale", city: "Lagos", bedrooms: 3, bathrooms: 3, area_sqm: 200, notes: "" });
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); onResult(null, true);
    try {
      const { data } = await api.post(endpoint, { ...f, bedrooms: Number(f.bedrooms), bathrooms: Number(f.bathrooms), area_sqm: Number(f.area_sqm) });
      onResult(data.output, false);
    } catch (e) { toast.error(e.response?.data?.detail || "Generation failed"); onResult("", false); } finally { setLoading(false); }
  };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-5 space-y-3">
        <div className="space-y-1.5"><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="ai-title" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Type</Label><Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>City</Label><Select value={f.city} onValueChange={(v) => setF({ ...f, city: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Beds</Label><Input type="number" value={f.bedrooms} onChange={(e) => setF({ ...f, bedrooms: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Baths</Label><Input type="number" value={f.bathrooms} onChange={(e) => setF({ ...f, bathrooms: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Area m²</Label><Input type="number" value={f.area_sqm} onChange={(e) => setF({ ...f, area_sqm: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Condition, amenities, location highlights..." /></div>
        <Button onClick={run} disabled={loading || !canUse} className="w-full" data-testid="ai-generate">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />} {cta}</Button>
      </Card>
      <ResultPanel text={typeof onResult.text === "string" ? onResult.text : undefined} loading={false} />
    </div>
  );
}

export default function AIManagement() {
  const { can } = useAuth();
  const canUse = can("ai_management", "create");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState("");
  const [history, setHistory] = useState([]);

  const loadHistory = () => api.get("/ai/history").then((r) => setHistory(r.data)).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  const handleResult = (text, isLoading) => { setLoading(isLoading); if (text !== null) { setResult(text); loadHistory(); } };

  const runProp = async (endpoint, payload) => {
    setLoading(true); setResult("");
    try { const { data } = await api.post(endpoint, payload); setResult(data.output); loadHistory(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setLoading(false); }
  };

  const runInsight = async () => {
    if (!insight.trim()) return;
    setLoading(true); setResult("");
    try { const { data } = await api.post("/ai/market-insight", { query: insight }); setResult(data.output); loadHistory(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6" data-testid="ai-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">AI Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Property intelligence powered by AMASS AI — valuations, descriptions & market insights.</p>
      </div>

      <Tabs defaultValue="valuation" onValueChange={() => setResult("")}>
        <TabsList>
          <TabsTrigger value="valuation" data-testid="ai-tab-valuation"><Calculator className="h-4 w-4 mr-1.5" /> Valuation</TabsTrigger>
          <TabsTrigger value="description" data-testid="ai-tab-description"><PenLine className="h-4 w-4 mr-1.5" /> Description</TabsTrigger>
          <TabsTrigger value="insight" data-testid="ai-tab-insight"><LineChart className="h-4 w-4 mr-1.5" /> Market Insight</TabsTrigger>
        </TabsList>

        <TabsContent value="valuation" className="mt-4"><PropTool cta="Estimate Value" canUse={canUse} loading={loading} result={result} onRun={(p) => runProp("/ai/valuation", p)} /></TabsContent>
        <TabsContent value="description" className="mt-4"><PropTool cta="Write Description" canUse={canUse} loading={loading} result={result} onRun={(p) => runProp("/ai/description", p)} /></TabsContent>
        <TabsContent value="insight" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5 space-y-3">
              <Label>Ask AMASS AI about a market</Label>
              <Textarea value={insight} onChange={(e) => setInsight(e.target.value)} className="min-h-[140px]" placeholder="e.g. What are the current trends for 3-bedroom rentals in Lekki, Lagos?" data-testid="ai-insight-input" />
              <Button onClick={runInsight} disabled={loading || !canUse || !insight.trim()} className="w-full" data-testid="ai-insight-generate">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />} Generate Insight</Button>
            </Card>
            <ResultPanel text={result} loading={loading} />
          </div>
        </TabsContent>
      </Tabs>

      <Card className="p-6">
        <h3 className="font-heading font-semibold text-sm mb-3">Recent Generations</h3>
        <div className="space-y-2">
          {history.length === 0 && <p className="text-sm text-muted-foreground py-4">No AI generations yet.</p>}
          {history.slice(0, 8).map((h) => (
            <div key={h.id} className="flex items-start gap-3 py-2.5 border-b border-border/60 last:border-0" data-testid={`ai-history-${h.id}`}>
              <Badge variant="outline" className="capitalize shrink-0 mt-0.5">{h.kind}</Badge>
              <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{h.output}</p>
              <span className="text-[10px] text-muted-foreground shrink-0">{new Date(h.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PropTool({ cta, canUse, loading, result, onRun }) {
  const [f, setF] = useState({ title: "", type: "Apartment", listing: "Sale", city: "Lagos", bedrooms: 3, bathrooms: 3, area_sqm: 200, notes: "" });
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-5 space-y-3">
        <div className="space-y-1.5"><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="ai-title" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Type</Label><Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}><SelectTrigger data-testid="ai-type"><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>City</Label><Select value={f.city} onValueChange={(v) => setF({ ...f, city: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Beds</Label><Input type="number" value={f.bedrooms} onChange={(e) => setF({ ...f, bedrooms: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Baths</Label><Input type="number" value={f.bathrooms} onChange={(e) => setF({ ...f, bathrooms: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Area m²</Label><Input type="number" value={f.area_sqm} onChange={(e) => setF({ ...f, area_sqm: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Condition, amenities, location highlights..." /></div>
        <Button onClick={() => onRun({ ...f, bedrooms: Number(f.bedrooms), bathrooms: Number(f.bathrooms), area_sqm: Number(f.area_sqm) })} disabled={loading || !canUse || !f.title} className="w-full" data-testid="ai-generate">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />} {cta}</Button>
      </Card>
      <ResultPanel text={result} loading={loading} />
    </div>
  );
}
