import React, { useEffect, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ShieldCheck, Star, Store } from "lucide-react";

const CATS = [
  { key: "all", label: "All" },
  { key: "home", label: "Home" },
  { key: "construction", label: "Construction" },
  { key: "services", label: "FIXA Services" },
  { key: "furniture", label: "Furniture" },
  { key: "electronics", label: "Electronics" },
];

export function Marketplace() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .marketplace({ category: cat !== "all" ? cat : undefined, q: q || undefined, limit: 80 })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [cat]);

  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    api
      .marketplace({ category: cat !== "all" ? cat : undefined, q: q || undefined, limit: 80 })
      .then(setItems)
      .finally(() => setLoading(false));
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10" data-testid="marketplace-page">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">
          AMASS Marketplace
        </div>
        <h1 className="font-display text-4xl md:text-5xl">Everything for your next home</h1>
      </div>

      <form onSubmit={submit} className="mt-6 flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, services, brands…"
            className="pl-9 h-11 rounded-xl"
            data-testid="marketplace-search"
          />
        </div>
        <Button type="submit" className="amass-btn-primary rounded-xl h-11 px-6">Search</Button>
      </form>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2" data-testid="marketplace-categories">
        {CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            data-testid={`cat-${c.key}`}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              cat === c.key
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 text-sm text-neutral-500">
        {loading ? "Loading…" : `${items.length} items available`}
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((it) => (
          <div
            key={it.id}
            className="group bg-white rounded-2xl overflow-hidden amass-shadow-card amass-shadow-hover"
            data-testid={`market-item-${it.id}`}
          >
            <div className="aspect-square bg-neutral-100 overflow-hidden">
              <img
                src={it.image}
                alt={it.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1 text-[10px] text-neutral-500 uppercase tracking-wider">
                <Store size={10} /> {it.vendor}
                {it.verified && <ShieldCheck size={10} className="text-[color:var(--amass-red)]" />}
              </div>
              <h3 className="mt-1 text-sm font-semibold line-clamp-2">{it.name}</h3>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="font-serif text-xl">{formatNaira(it.price)}</div>
                <div className="text-xs text-neutral-500 flex items-center gap-0.5">
                  <Star size={10} fill="currentColor" className="text-amber-500" />
                  {it.rating}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="text-center py-24 text-neutral-500">
          No items found. Try another category or search term.
        </div>
      )}
    </div>
  );
}
