import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, RotateCcw, Plus, Trash2 } from "lucide-react";

const ICON_OPTIONS = ["shield", "sparkles", "wallet", "building"];

export function AdminCMS() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.admin.cmsLanding().then(setData).catch((e) => toast.error(e.message));
  }, []);

  const update = (patch) => setData((d) => ({ ...d, ...patch }));
  const updateHero = (patch) => setData((d) => ({ ...d, hero: { ...d.hero, ...patch } }));
  const updateCta = (patch) => setData((d) => ({ ...d, cta: { ...d.cta, ...patch } }));
  const updateMkt = (patch) => setData((d) => ({ ...d, marketplace_teaser: { ...d.marketplace_teaser, ...patch } }));
  const updateFlags = (patch) => setData((d) => ({ ...d, feature_flags: { ...d.feature_flags, ...patch } }));

  const save = async () => {
    setBusy(true);
    try {
      const patch = {
        hero: data.hero,
        stats: data.stats,
        value_props: data.value_props,
        marketplace_teaser: data.marketplace_teaser,
        cta: data.cta,
        feature_flags: data.feature_flags,
      };
      const res = await api.admin.updateCmsLanding(patch);
      setData(res);
      toast.success("Landing page updated — live on public site now");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Reset the landing page to factory defaults?")) return;
    setBusy(true);
    try {
      const res = await api.admin.resetCmsLanding();
      setData(res.content);
      toast.success("Landing content reset");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div data-testid="admin-cms">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">CMS</div>
          <h1 className="font-display text-4xl">Landing page content</h1>
          <p className="mt-2 text-neutral-500">Edits go live instantly across web and mobile.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} className="rounded-full" data-testid="cms-reset">
            <RotateCcw size={14} className="mr-1" /> Reset
          </Button>
          <Button onClick={save} disabled={busy} className="amass-btn-red rounded-full" data-testid="cms-save">
            <Save size={14} className="mr-1" /> {busy ? "Saving…" : "Save & publish"}
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {/* HERO */}
        <Section title="Hero">
          <Field label="Eyebrow"><Input value={data.hero.eyebrow || ""} onChange={(e) => updateHero({ eyebrow: e.target.value })} data-testid="cms-hero-eyebrow" /></Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Title line 1"><Input value={data.hero.title_line_1 || ""} onChange={(e) => updateHero({ title_line_1: e.target.value })} data-testid="cms-hero-line1" /></Field>
            <Field label="Title line 2"><Input value={data.hero.title_line_2 || ""} onChange={(e) => updateHero({ title_line_2: e.target.value })} data-testid="cms-hero-line2" /></Field>
          </div>
          <Field label="Accent word in line 2 (italic red)"><Input value={data.hero.title_line_2_accent || ""} onChange={(e) => updateHero({ title_line_2_accent: e.target.value })} data-testid="cms-hero-accent" /></Field>
          <Field label="Subtitle"><Textarea rows={3} value={data.hero.subtitle || ""} onChange={(e) => updateHero({ subtitle: e.target.value })} data-testid="cms-hero-subtitle" /></Field>
          <Field label="Search placeholder"><Input value={data.hero.search_placeholder || ""} onChange={(e) => updateHero({ search_placeholder: e.target.value })} data-testid="cms-hero-placeholder" /></Field>
        </Section>

        {/* STATS */}
        <Section title="Stats" onAdd={() => update({ stats: [...data.stats, { n: "0", label: "New stat" }] })}>
          <div className="grid md:grid-cols-2 gap-3">
            {data.stats.map((s, i) => (
              <div key={i} className="flex gap-2 items-end p-3 rounded-xl border border-neutral-200 bg-neutral-50" data-testid={`cms-stat-${i}`}>
                <div className="flex-1">
                  <Label className="text-xs">Number</Label>
                  <Input value={s.n} onChange={(e) => update({ stats: data.stats.map((x, j) => j === i ? { ...x, n: e.target.value } : x) })} />
                </div>
                <div className="flex-[2]">
                  <Label className="text-xs">Label</Label>
                  <Input value={s.label} onChange={(e) => update({ stats: data.stats.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => update({ stats: data.stats.filter((_, j) => j !== i) })} className="text-red-600 h-9 w-9 p-0">
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </Section>

        {/* VALUE PROPS */}
        <Section title="Value propositions" onAdd={() => update({ value_props: [...data.value_props, { icon: "sparkles", title: "New", body: "" }] })}>
          <div className="space-y-3">
            {data.value_props.map((v, i) => (
              <div key={i} className="p-4 rounded-xl border border-neutral-200 bg-neutral-50" data-testid={`cms-vp-${i}`}>
                <div className="grid md:grid-cols-[120px_1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Icon</Label>
                    <select value={v.icon} onChange={(e) => update({ value_props: data.value_props.map((x, j) => j === i ? { ...x, icon: e.target.value } : x) })} className="w-full h-10 border border-neutral-200 rounded-md px-2 text-sm">
                      {ICON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Title</Label>
                    <Input value={v.title} onChange={(e) => update({ value_props: data.value_props.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                  </div>
                  <div>
                    <Label className="text-xs">Body</Label>
                    <Input value={v.body} onChange={(e) => update({ value_props: data.value_props.map((x, j) => j === i ? { ...x, body: e.target.value } : x) })} />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => update({ value_props: data.value_props.filter((_, j) => j !== i) })} className="text-red-600 h-9 w-9 p-0">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* MARKETPLACE TEASER */}
        <Section title="Marketplace teaser">
          <Field label="Eyebrow"><Input value={data.marketplace_teaser.eyebrow || ""} onChange={(e) => updateMkt({ eyebrow: e.target.value })} /></Field>
          <Field label="Title"><Input value={data.marketplace_teaser.title || ""} onChange={(e) => updateMkt({ title: e.target.value })} data-testid="cms-mkt-title" /></Field>
          <Field label="Body"><Textarea rows={3} value={data.marketplace_teaser.body || ""} onChange={(e) => updateMkt({ body: e.target.value })} /></Field>
        </Section>

        {/* CTA */}
        <Section title="Bottom call-to-action">
          <Field label="Title"><Input value={data.cta.title || ""} onChange={(e) => updateCta({ title: e.target.value })} data-testid="cms-cta-title" /></Field>
          <Field label="Body"><Textarea rows={2} value={data.cta.body || ""} onChange={(e) => updateCta({ body: e.target.value })} /></Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Primary button label"><Input value={data.cta.primary_label || ""} onChange={(e) => updateCta({ primary_label: e.target.value })} /></Field>
            <Field label="Primary button link"><Input value={data.cta.primary_href || ""} onChange={(e) => updateCta({ primary_href: e.target.value })} /></Field>
            <Field label="Secondary button label"><Input value={data.cta.secondary_label || ""} onChange={(e) => updateCta({ secondary_label: e.target.value })} /></Field>
            <Field label="Secondary button link"><Input value={data.cta.secondary_href || ""} onChange={(e) => updateCta({ secondary_href: e.target.value })} /></Field>
          </div>
        </Section>

        {/* FEATURE FLAGS */}
        <Section title="Feature flags">
          <div className="space-y-3">
            {Object.entries(data.feature_flags || {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50" data-testid={`cms-flag-${k}`}>
                <div>
                  <div className="font-medium text-sm">{k.replace(/_/g, " ")}</div>
                  <div className="text-xs text-neutral-500">Toggle the section on/off across web + mobile</div>
                </div>
                <Switch checked={v} onCheckedChange={(nv) => updateFlags({ [k]: nv })} />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children, onAdd }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {onAdd && (
          <Button size="sm" variant="outline" onClick={onAdd} className="rounded-full">
            <Plus size={14} className="mr-1" /> Add
          </Button>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs text-neutral-600">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
