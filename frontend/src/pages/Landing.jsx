import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { PropertyCard } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Search, ShieldCheck, Sparkles, Building2, Wallet, MapPin } from "lucide-react";

export function Landing() {
  const [featured, setFeatured] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.listProperties({ verified: true, limit: 6 }).then(setFeatured).catch(() => {});
    api.neighborhoods().then((n) => setNeighborhoods(n.slice(0, 4))).catch(() => {});
  }, []);

  return (
    <div data-testid="landing-page">
      {/* HERO */}
      <section className="relative amass-hero-gradient overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-32 md:pb-32">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-200 bg-white/70 text-xs text-neutral-700 amass-fade-up">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--amass-red)] animate-pulse" />
              Africa's Property Operating System · Now unified across web & mobile
            </div>
            <h1 className="mt-6 font-display text-5xl md:text-7xl lg:text-8xl leading-[1.0] text-neutral-900 amass-fade-up-delay-1">
              Discover, verify,
              <br />
              <span className="italic text-[color:var(--amass-red)]">own it</span>.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-neutral-600 max-w-2xl amass-fade-up-delay-2">
              One trusted network for African real estate — from Lagos duplexes
              and Abuja land to Nairobi apartments. Verified titles, AI-powered
              search, and a marketplace to actually make your home a home.
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
                placeholder="Try “3 bed apartment in Lekki” or “land in Abeokuta”"
                className="flex-1 px-3 py-3 bg-transparent outline-none text-base"
                data-testid="hero-search-input"
              />
              <Button
                type="submit"
                className="amass-btn-red rounded-full h-11 px-6"
                data-testid="hero-search-submit"
              >
                Search
              </Button>
            </form>

            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 amass-fade-up-delay-3">
              <Stat n="12,000+" label="Verified listings" />
              <Stat n="850+" label="Certified agents" />
              <Stat n="35+" label="Cities across Africa" />
              <Stat n="₦4.2B" label="Transacted this quarter" />
            </div>
          </div>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid md:grid-cols-3 gap-8">
          <ValueCard
            icon={<ShieldCheck />}
            title="Title-verified"
            body="Every AMASS-verified property has been cross-checked against land registries and mandate documents so you don't walk into surprises."
          />
          <ValueCard
            icon={<Sparkles />}
            title="AI that actually knows Africa"
            body="Search in plain English or Pidgin. Our AI understands neighborhoods, prices in ₦ and answers investment questions."
          />
          <ValueCard
            icon={<Wallet />}
            title="One wallet, everywhere"
            body="MASS unlocks premium property intel. FIX rewards verified service providers. Same balance in the app, the web, and the admin."
          />
        </div>
      </section>

      {/* FEATURED PROPERTIES */}
      <section className="mx-auto max-w-7xl px-6 py-16 border-t border-neutral-100">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-2">
              Handpicked · Verified
            </div>
            <h2 className="font-display text-4xl md:text-5xl leading-none">
              Featured listings
            </h2>
          </div>
          <Link
            to="/properties"
            className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-neutral-700 hover:text-[color:var(--amass-red)]"
            data-testid="see-all-properties"
          >
            See all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.slice(0, 6).map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
          {featured.length === 0 && (
            <div className="col-span-full text-center py-16 text-neutral-500">
              Loading featured listings…
            </div>
          )}
        </div>
      </section>

      {/* MARKETPLACE TEASER */}
      <section className="mx-auto max-w-7xl px-6 py-24 border-t border-neutral-100">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-2">
              AMASS Marketplace
            </div>
            <h2 className="font-display text-4xl md:text-5xl leading-none">
              After you find the house, we help you make it a home.
            </h2>
            <p className="mt-5 text-neutral-600 text-lg leading-relaxed">
              Furniture, construction materials, and vetted service pros through
              FIXA — bookable in-app with FIX tokens. Everything you need to
              move in, renovate, or rent out.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/marketplace">
                <Button className="amass-btn-primary rounded-full px-6 h-12">
                  Browse marketplace <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="outline" className="rounded-full px-6 h-12 border-neutral-300">
                  Become a seller
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800",
              "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800",
              "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
              "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
            ].map((src, i) => (
              <div
                key={i}
                className={`rounded-2xl overflow-hidden aspect-square ${i % 2 === 1 ? "mt-8" : ""}`}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEIGHBORHOODS */}
      {neighborhoods.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-24 border-t border-neutral-100">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-2">
                Neighborhood intelligence
              </div>
              <h2 className="font-display text-4xl md:text-5xl">Where Africa lives</h2>
            </div>
            <Link
              to="/discover"
              className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-neutral-700 hover:text-[color:var(--amass-red)]"
            >
              Explore all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {neighborhoods.map((n) => (
              <Link
                key={n.id}
                to="/discover"
                className="group block rounded-2xl overflow-hidden relative aspect-[3/4] amass-shadow-hover"
                data-testid={`landing-neighborhood-${n.id}`}
              >
                <img
                  src={n.image}
                  alt={n.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                  <div className="text-xs opacity-80 flex items-center gap-1">
                    <MapPin size={12} /> {n.city}, {n.state}
                  </div>
                  <div className="mt-1 font-display text-2xl">{n.name}</div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div className="text-xs opacity-80">Avg {formatNaira(n.avg_price)}</div>
                    <div className="text-xs font-semibold text-emerald-300">
                      +{n.price_change_pct}% YoY
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="relative rounded-3xl bg-neutral-900 text-white overflow-hidden p-12 md:p-20">
          <div className="amass-noise absolute inset-0" />
          <div className="relative max-w-2xl">
            <Building2 className="w-10 h-10 mb-6 text-[color:var(--amass-red)]" />
            <h2 className="font-display text-4xl md:text-6xl leading-[1.05]">
              Ready to list, sell, or find your next place?
            </h2>
            <p className="mt-4 text-neutral-300 text-lg">
              Join thousands of buyers, verified agents and homeowners already
              using AMASS across Nigeria, Kenya, Ghana and Rwanda.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register">
                <Button className="amass-btn-red rounded-full px-6 h-12">
                  Create an account
                </Button>
              </Link>
              <Link to="/properties">
                <Button
                  variant="outline"
                  className="rounded-full px-6 h-12 bg-white/10 border-white/30 text-white hover:bg-white hover:text-black"
                >
                  Browse properties
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div>
      <div className="font-display text-4xl md:text-5xl leading-none">{n}</div>
      <div className="mt-1 text-sm text-neutral-500">{label}</div>
    </div>
  );
}

function ValueCard({ icon, title, body }) {
  return (
    <div className="p-8 rounded-2xl border border-neutral-100 hover:border-neutral-200 amass-shadow-hover bg-white">
      <div className="w-11 h-11 rounded-full bg-red-50 text-[color:var(--amass-red)] flex items-center justify-center mb-5">
        {icon}
      </div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-neutral-600 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
