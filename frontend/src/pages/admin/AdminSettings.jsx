import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Save, Plus, Trash2 } from "lucide-react";

const SECTIONS = [
  { key: "token_bundles", title: "MASS Token bundles", fields: ["id", "name", "tokens", "bonus", "price_ngn"] },
  { key: "fix_bundles", title: "FIX Token bundles", fields: ["id", "name", "tokens", "bonus", "price_ngn"] },
  { key: "subscription_plans", title: "Subscription plans", fields: ["id", "name", "price_ngn", "monthly_tokens"] },
];

export function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.admin.settings().then(setSettings).catch((e) => toast.error(e.message));
  }, []);

  const updateSection = (key, rows) => setSettings((s) => ({ ...s, [key]: rows }));

  const save = async (key) => {
    setBusy(true);
    try {
      await api.admin.updateSettings(key, settings[key]);
      toast.success(`${key.replace(/_/g, " ")} saved — live everywhere now`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div data-testid="admin-settings">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">Settings</div>
        <h1 className="font-display text-4xl">Token economy & plans</h1>
        <p className="mt-2 text-neutral-500">
          Prices, bundles and monthly plans. Changes take effect immediately for every client (web, mobile, admin).
        </p>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((s) => (
          <div key={s.key} className="rounded-2xl border border-neutral-200 bg-white p-6" data-testid={`settings-${s.key}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => {
                    const blank = Object.fromEntries(s.fields.map((f) => [f, f === "id" ? `new_${Date.now()}` : (f === "name" ? "New" : 0)]));
                    updateSection(s.key, [...settings[s.key], blank]);
                  }}
                  className="rounded-full"
                >
                  <Plus size={14} className="mr-1" /> Add
                </Button>
                <Button size="sm" onClick={() => save(s.key)} disabled={busy} className="amass-btn-red rounded-full" data-testid={`save-${s.key}`}>
                  <Save size={14} className="mr-1" /> Save
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-neutral-500 border-b border-neutral-100">
                  <tr>
                    {s.fields.map((f) => <th key={f} className="text-left px-3 py-2">{f}</th>)}
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {settings[s.key].map((row, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      {s.fields.map((f) => (
                        <td key={f} className="px-3 py-2">
                          <Input
                            value={row[f] ?? ""}
                            onChange={(e) => {
                              const v = ["tokens", "bonus", "price_ngn", "monthly_tokens"].includes(f)
                                ? Number(e.target.value)
                                : e.target.value;
                              updateSection(s.key, settings[s.key].map((r, j) => j === i ? { ...r, [f]: v } : r));
                            }}
                            className="h-9"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => updateSection(s.key, settings[s.key].filter((_, j) => j !== i))}
                          className="text-red-600 hover:bg-red-50 h-9 w-9 p-0"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
