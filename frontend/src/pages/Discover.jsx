import React, { useEffect, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { MapPin, TrendingUp } from "lucide-react";

export function Discover() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.neighborhoods().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10" data-testid="discover-page">
      <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">
        Discover
      </div>
      <h1 className="font-display text-4xl md:text-5xl">Neighborhood intelligence</h1>
      <p className="mt-3 text-neutral-600 max-w-2xl">
        Data-backed scores on walkability, schools, safety and infrastructure — so
        you buy in the right place, not just the pretty one.
      </p>

      {loading && <div className="py-24 text-center text-neutral-500">Loading…</div>}

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        {rows.map((n) => (
          <div key={n.id} className="rounded-2xl overflow-hidden bg-white amass-shadow-card amass-shadow-hover" data-testid={`neigh-${n.id}`}>
            <div className="relative aspect-[16/9]">
              <img src={n.image} alt={n.name} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <div className="text-xs opacity-80 flex items-center gap-1"><MapPin size={12} />{n.city}, {n.state}</div>
                <div className="font-display text-3xl">{n.name}</div>
              </div>
              {n.trending && (
                <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[color:var(--amass-red)] text-white text-[10px] font-semibold uppercase tracking-wider">
                  <TrendingUp size={10} /> Trending
                </div>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-xs text-neutral-500">Average price</div>
                  <div className="font-serif text-2xl">{formatNaira(n.avg_price)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-500">YoY change</div>
                  <div className="font-semibold text-emerald-600">+{n.price_change_pct}%</div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2">
                <Score label="Walk" v={n.walk_score} />
                <Score label="Schools" v={n.school_score} />
                <Score label="Safety" v={n.safety_score} />
                <Score label="Infra" v={n.infrastructure_score} />
              </div>
              <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between">
                <div className="text-xs text-neutral-500">AMASS overall score</div>
                <div className="font-serif text-3xl">{n.overall_score}<span className="text-sm text-neutral-400">/100</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Score({ label, v }) {
  return (
    <div className="text-center">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="font-semibold">{v}</div>
      <div className="mt-1 h-1 rounded-full bg-neutral-100 overflow-hidden">
        <div className="h-full bg-[color:var(--amass-red)]" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
