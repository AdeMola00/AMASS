import React, { useEffect, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { Users, Building2, ShoppingBag, ShieldCheck, TrendingUp, Wallet, Eye, Heart } from "lucide-react";

export function AdminDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.admin.dashboard().then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="text-red-600" data-testid="admin-dashboard-error">Error: {err}</div>;
  if (!data) return <div className="text-neutral-500">Loading…</div>;

  const cards = [
    { icon: <Users />, label: "Total users", value: data.totals.users, change: `+${data.weekly.new_users} this week` },
    { icon: <Building2 />, label: "Properties", value: data.totals.properties, change: `${data.totals.properties_verified} verified · ${data.totals.properties_pending} pending` },
    { icon: <ShoppingBag />, label: "Marketplace items", value: data.totals.marketplace_items },
    { icon: <ShieldCheck />, label: "Agents", value: data.totals.agents, change: `${data.totals.agents_pending} pending review` },
    { icon: <Wallet />, label: "Revenue (all-time)", value: formatNaira(data.revenue_ngn) },
    { icon: <Eye />, label: "Views this week", value: data.weekly.views },
    { icon: <Heart />, label: "Favorites this week", value: data.weekly.favorites },
    { icon: <TrendingUp />, label: "New listings", value: data.weekly.new_properties, change: "This week" },
  ];

  return (
    <div data-testid="admin-dashboard">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">
          Overview
        </div>
        <h1 className="font-display text-4xl">Platform dashboard</h1>
        <p className="mt-2 text-neutral-500">Live from the unified production backend and database.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="p-6 rounded-2xl border border-neutral-200 bg-white" data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="flex items-center gap-2 text-neutral-500 text-xs uppercase tracking-widest">
              {c.icon} {c.label}
            </div>
            <div className="mt-3 font-display text-3xl">{c.value}</div>
            {c.change && <div className="text-xs text-neutral-500 mt-1">{c.change}</div>}
          </div>
        ))}
      </div>

      {data.top_cities.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">Top cities by listings</h2>
          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
            {data.top_cities.map((c, i) => (
              <div
                key={c.city}
                className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 last:border-0"
                data-testid={`top-city-${i}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-semibold">
                    {i + 1}
                  </div>
                  <div className="font-medium">{c.city}</div>
                </div>
                <div className="text-neutral-600 text-sm">{c.count} listings</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
