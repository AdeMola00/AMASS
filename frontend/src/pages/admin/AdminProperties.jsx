import React, { useEffect, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Search, Trash2 } from "lucide-react";

export function AdminProperties() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = { q: q || undefined, limit: 100 };
    if (filter === "pending") params.verified = false;
    if (filter === "verified") params.verified = true;
    api.admin.properties(params).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const approve = async (p, verified) => {
    try {
      await api.admin.approveProperty(p.id, { verified, status: verified ? "verified" : "available" });
      toast.success(verified ? "Property verified" : "Verification revoked");
      load();
    } catch (e) { toast.error(e.message); }
  };

  const del = async (p) => {
    if (!window.confirm(`Delete "${p.title}"? This is irreversible.`)) return;
    try {
      await api.admin.deleteProperty(p.id);
      toast.success("Property deleted");
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div data-testid="admin-properties">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">Properties</div>
          <h1 className="font-display text-4xl">Listing approvals</h1>
        </div>
        <div className="flex gap-2">
          {["all", "pending", "verified"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              data-testid={`filter-${f}`}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${
                filter === f ? "bg-black text-white" : "bg-white border border-neutral-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); load(); }}
        className="flex gap-2 mb-6"
      >
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, city, agent…" className="pl-9 h-11 rounded-xl" data-testid="admin-props-search" />
        </div>
        <Button type="submit" className="amass-btn-primary rounded-xl h-11 px-6">Search</Button>
      </form>

      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
            <tr>
              <th className="text-left px-6 py-3">Property</th>
              <th className="text-left px-6 py-3">Location</th>
              <th className="text-left px-6 py-3">Price</th>
              <th className="text-left px-6 py-3">Source</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-right px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="6" className="px-6 py-12 text-center text-neutral-500">Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan="6" className="px-6 py-12 text-center text-neutral-500">No listings match this filter.</td></tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100" data-testid={`admin-prop-${p.id}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-10 rounded-md bg-neutral-100 overflow-hidden shrink-0">
                      {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate max-w-[280px]">{p.title}</div>
                      <div className="text-xs text-neutral-500 truncate max-w-[280px]">by {p.agent_name || "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-neutral-700">{p.city}, {p.state}</td>
                <td className="px-6 py-4 font-serif">{formatNaira(p.price)}</td>
                <td className="px-6 py-4">
                  <Badge variant="outline">{(p.listing_source || "pending").replace("_", " ")}</Badge>
                </td>
                <td className="px-6 py-4">
                  {p.verified ? (
                    <Badge className="bg-emerald-100 text-emerald-800">Verified</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800">Pending</Badge>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-2">
                    {!p.verified ? (
                      <Button size="sm" onClick={() => approve(p, true)} className="amass-btn-red rounded-full" data-testid={`approve-${p.id}`}>
                        <Check size={14} className="mr-1" /> Approve
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => approve(p, false)} className="rounded-full" data-testid={`revoke-${p.id}`}>
                        <X size={14} className="mr-1" /> Revoke
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => del(p)} className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid={`delete-${p.id}`}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
