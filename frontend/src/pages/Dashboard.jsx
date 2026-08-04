import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api, formatNaira } from "@/lib/api";
import { PropertyCard } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Wallet, Home, Building2, ArrowRight } from "lucide-react";

export function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [favs, setFavs] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [agent, setAgent] = useState(null);

  useEffect(() => {
    api.listFavorites().then(setFavs).catch(() => setFavs([]));
    api.walletDual().then(setWallet).catch(() => setWallet(null));
    if (user?.is_agent) {
      api.agentDashboard().then(setAgent).catch(() => setAgent(null));
    }
  }, [user]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10" data-testid="dashboard-page">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">
          Your dashboard
        </div>
        <h1 className="font-display text-4xl md:text-5xl">Hello, {user?.full_name?.split(" ")[0]}</h1>
        {isAdmin && (
          <Link to="/admin" className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-[color:var(--amass-red)]" data-testid="dashboard-admin-link">
            Open Admin Portal <ArrowRight size={14} />
          </Link>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Wallet />} label="MASS balance"
          value={wallet ? wallet.mass.spendable : "—"}
          suffix="MASS"
          detail="Property utility"
        />
        <StatCard
          icon={<Wallet />} label="FIX balance"
          value={wallet ? wallet.fix.spendable : "—"}
          suffix="FIX"
          detail="FIXA services"
        />
        <StatCard
          icon={<Heart />} label="Favorites"
          value={favs.length}
          detail="Saved properties"
        />
      </div>

      {user?.is_agent && agent && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">Your listings</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Total" value={agent.stats.listings} />
            <MiniStat label="Active" value={agent.stats.active} />
            <MiniStat label="Verified" value={agent.stats.verified} />
            <MiniStat label="Views (30d)" value={agent.stats.views_30d} />
          </div>
        </div>
      )}

      <div className="mt-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold">Saved properties</h2>
          <Link to="/properties" className="text-sm text-neutral-600 hover:text-[color:var(--amass-red)]">
            Browse more →
          </Link>
        </div>
        {favs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 p-12 text-center text-neutral-500">
            <Heart className="mx-auto mb-3 text-neutral-400" />
            You haven't saved any properties yet.
            <div className="mt-4">
              <Link to="/properties">
                <Button className="amass-btn-primary rounded-full">Discover properties</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {favs.map((p) => <PropertyCard key={p.id} property={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, suffix = "", detail = "" }) {
  return (
    <div className="p-6 rounded-2xl border border-neutral-200 bg-white amass-shadow-card">
      <div className="flex items-center gap-2 text-neutral-500 text-xs uppercase tracking-widest">
        {icon} {label}
      </div>
      <div className="mt-3 font-display text-4xl">
        {value}{suffix && <span className="text-lg text-neutral-500 ml-1">{suffix}</span>}
      </div>
      <div className="text-xs text-neutral-500 mt-1">{detail}</div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="p-4 rounded-xl border border-neutral-200 bg-white">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="font-serif text-3xl mt-1">{value}</div>
    </div>
  );
}
