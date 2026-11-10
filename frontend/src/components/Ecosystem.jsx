import React from "react";
import { Briefcase, LayoutDashboard, Database } from "lucide-react";
import { Reveal } from "@/components/anim/Reveal";

const NODES = [
  {
    id: "app",
    title: "AMASS App",
    audience: "Buyers · Renters · Homeowners",
    desc: "Search, verify, finance, insure and transact on Africa's intelligent property map.",
  },
  {
    id: "agent",
    title: "AMASS Agent",
    audience: "Agents · FIXA Pros",
    desc: "Listings, CRM, analytics and marketing tools — every enquiry lands here in real time.",
    icon: Briefcase,
  },
  {
    id: "admin",
    title: "Admin Control",
    audience: "The AMASS Team",
    desc: "Content, verification, listings and platform insights managed from one secure dashboard.",
    icon: LayoutDashboard,
  },
];

export default function Ecosystem() {
  return (
    <section id="ecosystem" data-testid="ecosystem-section" className="relative overflow-hidden bg-brand-charcoal py-24 md:py-32">
      <div className="absolute inset-0 grain opacity-10" />
      <div className="pointer-events-none absolute inset-0 pattern-african opacity-[0.05]" />

      <div className="relative mx-auto max-w-[1400px] px-6 md:px-12">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-gold">Connected Ecosystem</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl">
            One platform. Every player. <span className="text-gradient-gold">One backend.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base text-white/70 md:text-lg">
            The AMASS App, AMASS Agent and Admin Control run on the same secure core —
            listings, leads and content flow between them instantly.
          </p>
        </Reveal>

        <div className="relative mt-16">
          {/* connector line through the node icons (desktop) */}
          <div className="absolute left-[18%] right-[18%] top-0 hidden h-px bg-gradient-to-r from-transparent via-white/25 to-transparent lg:block" />
          <div className="grid gap-14 lg:grid-cols-3 lg:gap-10">
            {NODES.map((n, i) => {
              const Icon = n.icon;
              return (
                <Reveal key={n.id} delay={i * 0.12}>
                  <div
                    data-testid={`ecosystem-card-${n.id}`}
                    className="relative rounded-3xl glass-dark border border-white/10 p-8 pt-12 text-center"
                  >
                    <span className="absolute left-1/2 top-0 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border border-white/15 bg-brand-charcoal shadow-floating">
                      {Icon ? (
                        <Icon className="h-8 w-8 text-brand-emerald" />
                      ) : (
                        <img src="/amass-app-icon.png" alt="AMASS App icon" className="h-14 w-14 rounded-xl" draggable="false" />
                      )}
                    </span>
                    <h3 className="mt-4 font-display text-xl font-bold text-white">{n.title}</h3>
                    <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">{n.audience}</p>
                    <p className="mt-4 text-sm leading-relaxed text-white/65">{n.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={0.3} className="mt-14 flex flex-col items-center">
            <span className="h-10 w-px bg-gradient-to-b from-white/25 to-brand-gold/60" />
            <span
              data-testid="ecosystem-hub"
              className="flex items-center gap-2.5 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-7 py-3.5 text-sm font-bold uppercase tracking-wider text-brand-gold"
            >
              <Database className="h-4 w-4" /> One Secure Backend
            </span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
