import React, { useEffect, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function AdminMarketplace() {
  const [items, setItems] = useState([]);
  const [cat, setCat] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.admin.marketplace({ category: cat || undefined, limit: 100 }).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cat]);

  const del = async (it) => {
    if (!window.confirm(`Delete "${it.name}"?`)) return;
    try {
      await api.admin.deleteMarketplaceItem(it.id);
      toast.success("Item deleted");
      load();
    } catch (e) { toast.error(e.message); }
  };

  const cats = ["", "home", "construction", "services", "furniture", "electronics", "appliances"];

  return (
    <div data-testid="admin-marketplace">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">Marketplace</div>
          <h1 className="font-display text-4xl">Product catalog</h1>
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="border border-neutral-200 rounded-xl h-11 px-4 text-sm"
          data-testid="marketplace-cat-select"
        >
          {cats.map((c) => (
            <option key={c} value={c}>{c ? c.charAt(0).toUpperCase() + c.slice(1) : "All categories"}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-neutral-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">No items in this category.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((it) => (
            <div key={it.id} className="p-3 rounded-2xl border border-neutral-200 bg-white" data-testid={`admin-market-${it.id}`}>
              <div className="aspect-square rounded-xl overflow-hidden bg-neutral-100 mb-3">
                <img src={it.image} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">{it.category}</div>
              <div className="font-medium text-sm line-clamp-2 mt-1">{it.name}</div>
              <div className="mt-2 flex items-center justify-between">
                <div className="font-serif">{formatNaira(it.price)}</div>
                <Button size="sm" variant="ghost" onClick={() => del(it)} className="text-red-600 hover:bg-red-50 h-8 w-8 p-0" data-testid={`del-${it.id}`}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
