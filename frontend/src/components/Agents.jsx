import React from "react";
import * as Lucide from "lucide-react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { AGENT_BENEFITS } from "@/data/content";
import { Reveal, Stagger, StaggerItem } from "@/components/anim/Reveal";
import { useLeadForm } from "@/context/LeadFormProvider";

export default function Agents() {
  const { openForm } = useLeadForm();
  return (
    <section id="agents" className="relative overflow-hidden bg-brand-charcoal py-24 md:py-32">
      <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-brand-emerald/20 blur-3xl" />
      <div className="absolute -left-24 bottom-10 h-80 w-80 rounded-full bg-brand-gold/10 blur-3xl" />

      <div className="relative mx-auto max-w-[1400px] px-6 md:px-12">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-gold">For Agents</p>
            <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl">
              Grow faster with the tools top agents use.
            </h2>
            <p className="mt-6 max-w-md text-base text-white/70 md:text-lg">
              List once, reach millions. Manage every property, lead and transaction from a
              dashboard designed to close deals.
            </p>
            <button
              onClick={() => openForm("become_agent")}
              data-testid="agents-cta"
              className="group mt-9 flex items-center gap-2 rounded-full bg-brand-emerald px-8 py-4 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.03]"
            >
              Become an AMASS Agent
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </Reveal>

          <Stagger className="grid gap-4 sm:grid-cols-2">
            {AGENT_BENEFITS.map((b) => {
              const Icon = Lucide[b.icon] || Lucide.Sparkles;
              return (
                <StaggerItem key={b.title}>
                  <motion.div
                    whileHover={{ y: -6 }}
                    className="h-full rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
                    data-testid={`agent-benefit-${b.title.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-emerald/15 text-brand-emerald">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-display text-lg font-bold text-white">{b.title}</h3>
                    <p className="mt-1.5 text-sm text-white/60">{b.desc}</p>
                  </motion.div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
