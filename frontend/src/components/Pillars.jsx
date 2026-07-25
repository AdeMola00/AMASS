import React from "react";
import * as Lucide from "lucide-react";
import { motion } from "framer-motion";
import { PILLARS } from "@/data/content";
import { Reveal, Stagger, StaggerItem } from "@/components/anim/Reveal";

export default function Pillars() {
  return (
    <section id="pillars" className="relative bg-background py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <div className="grid gap-6 md:grid-cols-2 md:items-end">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-emerald">What AMASS Does</p>
            <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
              A single platform for the entire property lifecycle.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-md text-base text-subtle md:text-lg">
              Six intelligent pillars — from discovery and verification to construction,
              furnishing and finance — working together in one elegant interface.
            </p>
          </Reveal>
        </div>

        <Stagger className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => {
            const Icon = Lucide[p.icon] || Lucide.Sparkles;
            return (
              <StaggerItem key={p.id}>
                <motion.div
                  whileHover={{ y: -8 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="group relative h-full overflow-hidden rounded-4xl border border-hairline bg-surface p-8 shadow-soft"
                  data-testid={`pillar-${p.id}`}
                >
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-emerald/10 blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-0" />
                  <div className="flex items-start justify-between">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-emerald/10 text-brand-emerald transition-colors group-hover:bg-brand-emerald group-hover:text-white">
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="font-mono text-sm text-subtle/60">{p.index}</span>
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-subtle">{p.desc}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {p.items.map((it) => (
                      <span key={it} className="rounded-full border border-hairline bg-background px-3 py-1 text-xs font-medium text-subtle">
                        {it}
                      </span>
                    ))}
                  </div>
                </motion.div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
