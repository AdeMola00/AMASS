import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, ShieldCheck } from "lucide-react";

export function AdminAgents() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.admin.agents({ status: status === "all" ? undefined : status }).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const decide = async (a, decision, level = null) => {
    try {
      await api.admin.agentDecision(a.user_id, decision, level);
      toast.success(`Agent ${decision}`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div data-testid="admin-agents">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">Agents</div>
          <h1 className="font-display text-4xl">Agent applications</h1>
        </div>
        <div className="flex gap-2">
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              data-testid={`filter-${s}`}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${
                status === s ? "bg-black text-white" : "bg-white border border-neutral-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-neutral-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">No agent applications with status "{status}".</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((a) => (
            <div key={a.user_id} className="p-6 rounded-2xl border border-neutral-200 bg-white" data-testid={`agent-${a.user_id}`}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden">
                  {a.avatar_url ? <img src={a.avatar_url} alt="" className="w-full h-full object-cover" /> : (a.full_name || "?").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold truncate">{a.full_name}</div>
                    {a.status === "approved" && <Badge className="bg-emerald-100 text-emerald-800">Approved</Badge>}
                    {a.status === "pending" && <Badge className="bg-amber-100 text-amber-800">Pending</Badge>}
                    {a.status === "rejected" && <Badge className="bg-red-100 text-red-800">Rejected</Badge>}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">{a.email} · {a.phone}</div>
                  <div className="mt-2 text-sm text-neutral-700">
                    {a.agency_name || "Individual agent"} · {a.state}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {a.years_experience} years experience · Level {a.verification_level}
                  </div>
                  {a.specialisations?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.specialisations.slice(0, 4).map((s) => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {a.status === "pending" && (
                <div className="mt-4 pt-4 border-t border-neutral-100 flex gap-2">
                  <Button size="sm" onClick={() => decide(a, "approved", 2)} className="amass-btn-red rounded-full flex-1" data-testid={`approve-${a.user_id}`}>
                    <Check size={14} className="mr-1" /> Approve L2
                  </Button>
                  <Button size="sm" onClick={() => decide(a, "approved", 3)} className="amass-btn-primary rounded-full flex-1" data-testid={`approve-l3-${a.user_id}`}>
                    <ShieldCheck size={14} className="mr-1" /> L3 Mandated
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide(a, "rejected")} className="rounded-full" data-testid={`reject-${a.user_id}`}>
                    <X size={14} />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
