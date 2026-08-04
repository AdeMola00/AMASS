import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { PropertyCard } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, ShieldCheck, Sparkles, Building2, Wallet, MapPin } from "lucide-react";

const ICONS = {
  shield: <ShieldCheck />,
  sparkles: <Sparkles />,
  wallet: <Wallet />,
  building: <Building2 />,
};

const FALLBACK = {
  hero: {
    eyebrow: "Loading…",
    title_line_1: "Discover, verify,",
    title_line_2: "own it.",
    title_line_2_accent: "own it",
    subtitle: "",
    search_placeholder: "Search…",
  },
  stats: [],
  value_props: [],
  marketplace_teaser: { eyebrow: "", title: "", body: "", images: [] },
  cta: { title: "", body: "", primary_label: "", primary_href: "/register", secondary_label: "", secondary_href: "/properties" },
  feature_flags: { show_neighborhoods: true, show_marketplace_teaser: true, show_featured: true },
};

export function Landing() {
  const [cms, setCms] = useState(FALLBACK);
  const [featured, setFeatured] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.cmsLanding().then((c) => setCms({ ...FALLBACK, ...c })).catch(() => {});
    api.listProperties({ verified: true, limit: 6 }).then(setFeatured).catch(() => {});
    api.neighborhoods().then((n) => setNeighborhoods(n.slice(0, 4))).catch(() => {});
  }, []);

  // Split hero title into pre + accent
  const accent = cms.hero.title_line_2_accent || "own it";
  const line2 = cms.hero.title_line_2 || "";
  const idx = line2.toLowerCase().indexOf(accent.toLowerCase());
  const line2Pre = idx > 0 ? line2.slice(0, idx) : "";
  const line2Post = idx >= 0 ? line2.slice(idx + accent.length) : "";

  return (
    <div data-testid="landing-page">
      <section className="relative amass-hero-gradient overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-32 md:pb-32">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-200 bg-white/70 text-xs text-neutral-700 amass-fade-up">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--amass-red)] animate-pulse" />
              {cms.hero.eyebrow}
            </div>
            <h1 className="mt-6 font-display text-5xl md:text-7xl lg:text-8xl leading-[1.0] text-neutral-900 amass-fade-up-delay-1">
              {cms.hero.title_line_1}
              <br />
              {line2Pre}
              <span className="italic text-[color:var(--amass-red)]">{accent}</span>
              {line2Post || "."}
            </h1>
            <p className="mt-6 text-lg md:text-xl text-neutral-600 max-w-2xl amass-fade-up-delay-2">
              {cms.hero.subtitle}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = `/properties?q=${encodeURIComponent(q)}`;
              }}
              className="mt-10 amass-fade-up-delay-3 max-w-2xl bg-white rounded-full shadow-2xl p-1.5 pl-6 flex items-center border border-neutral-100"
              data-testid="hero-search"
            >
              <Search size={20} className="text-neutral-400 shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={cms.hero.search_placeholder}
                className="flex-1 px-3 py-3 bg-transparent outline-none text-base"
                data-testid="hero-search-input"
              />
              <Button type="submit" className="amass-btn-red rounded-full h-11 px-6" data-testid="hero-search-submit">
                Search
              </Button>
            </form>

            {cms.stats.length > 0 && (
              <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 amass-fade-up-delay-3">
                {cms.stats.map((s, i) => (
                  <div key={i} data-testid={`stat-${i}`}>
                    <div className="font-display text-4xl md:text-5xl leading-none">{s.n}</div>
                    <div className="mt-1 text-sm text-neutral-500">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {cms.value_props.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid md:grid-cols-3 gap-8">
            {cms.value_props.map((v, i) => (
              <div key={i} className="p-8 rounded-2xl border border-neutral-100 hover:border-neutral-200 amass-shadow-hover bg-white" data-testid={`value-prop-${i}`}>
                <div className="w-11 h-11 rounded-full bg-red-50 text-[color:var(--amass-red)] flex items-center justify-center mb-5">
                  {ICONS[v.icon] || <Sparkles />}
                </div>
                <h3 className="text-xl font-semibold">{v.title}</h3>
                <p className="mt-2 text-neutral-600 text-sm leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {cms.feature_flags?.show_featured && (
        <section className="mx-auto max-w-7xl px-6 py-16 border-t border-neutral-100">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-2">
                Handpicked · Verified
              </div>
              <h2 className="font-display text-4xl md:text-5xl leading-none">Featured listings</h2>
            </div>
            <Link to="/properties" className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-neutral-700 hover:text-[color:var(--amass-red)]" data-testid="see-all-properties">
              See all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.slice(0, 6).map((p) => <PropertyCard key={p.id} property={p} />)}
            {featured.length === 0 && <div className="col-span-full text-center py-16 text-neutral-500">Loading featured listings…</div>}
          </div>
        </section>
      )}

      {cms.feature_flags?.show_marketplace_teaser && cms.marketplace_teaser.title && (
        <section className="mx-auto max-w-7xl px-6 py-24 border-t border-neutral-100">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-2">
                {cms.marketplace_teaser.eyebrow}
              </div>
              <h2 className="font-display text-4xl md:text-5xl leading-none">
                {cms.marketplace_teaser.title}
              </h2>
              <p className="mt-5 text-neutral-600 text-lg leading-relaxed">
                {cms.marketplace_teaser.body}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/marketplace">
                  <Button className="amass-btn-primary rounded-full px-6 h-12">
                    Browse marketplace <ArrowRight size={16} className="ml-2" />
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="outline" className="rounded-full px-6 h-12 border-neutral-300">Become a seller</Button>
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {cms.marketplace_teaser.images.map((src, i) => (
                <div key={i} className={`rounded-2xl overflow-hidden aspect-square ${i % 2 === 1 ? "mt-8" : ""}`}>
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {cms.feature_flags?.show_neighborhoods && neighborhoods.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-24 border-t border-neutral-100">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-2">
                Neighborhood intelligence
              </div>
              <h2 className="font-display text-4xl md:text-5xl">Where Africa lives</h2>
            </div>
            <Link to="/discover" className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-neutral-700 hover:text-[color:var(--amass-red)]">
              Explore all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {neighborhoods.map((n) => (
              <Link key={n.id} to="/discover" className="group block rounded-2xl overflow-hidden relative aspect-[3/4] amass-shadow-hover" data-testid={`landing-neighborhood-${n.id}`}>
                <img src={n.image} alt={n.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                  <div className="text-xs opacity-80 flex items-center gap-1"><MapPin size={12} /> {n.city}, {n.state}</div>
                  <div className="mt-1 font-display text-2xl">{n.name}</div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div className="text-xs opacity-80">Avg {formatNaira(n.avg_price)}</div>
                    <div className="text-xs font-semibold text-emerald-300">+{n.price_change_pct}% YoY</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="relative rounded-3xl bg-neutral-900 text-white overflow-hidden p-12 md:p-20">
          <div className="amass-noise absolute inset-0" />
          <div className="relative max-w-2xl">
            <Building2 className="w-10 h-10 mb-6 text-[color:var(--amass-red)]" />
            <h2 className="font-display text-4xl md:text-6xl leading-[1.05]">{cms.cta.title}</h2>
            <p className="mt-4 text-neutral-300 text-lg">{cms.cta.body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={cms.cta.primary_href || "/register"}>
                <Button className="amass-btn-red rounded-full px-6 h-12">{cms.cta.primary_label}</Button>
              </Link>
              <Link to={cms.cta.secondary_href || "/properties"}>
                <Button variant="outline" className="rounded-full px-6 h-12 bg-white/10 border-white/30 text-white hover:bg-white hover:text-black">
                  {cms.cta.secondary_label}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
