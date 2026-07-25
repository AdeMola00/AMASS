import React from "react";
import * as Lucide from "lucide-react";
import { motion } from "framer-motion";
import { PROFESSIONALS } from "@/data/content";
import { Reveal, Stagger, StaggerItem } from "@/components/anim/Reveal";
import { useLeadForm } from "@/context/LeadFormProvider";

export default function ConstructionPros() {
  const { openForm } = useLeadForm();
  return (
    <section className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-emerald">Construction Professionals</p>
            <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
              Verified experts for every build.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <button onClick={() => openForm("partner")} data-testid="pros-cta" className="rounded-full border border-hairline px-7 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface">
              Join as a Professional
            </button>
          </Reveal>
        </div>

        <Stagger className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-4">
          {PROFESSIONALS.map((p) => {
            const Icon = Lucide[p.icon] || Lucide.Wrench;
            return (
              <StaggerItem key={p.name}>
                <motion.div
                  whileHover={{ y: -6 }}
                  className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-hairline bg-surface p-6 shadow-soft"
                  data-testid={`pro-${p.name.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-charcoal text-white transition-colors group-hover:bg-brand-emerald dark:bg-white dark:text-black dark:group-hover:bg-brand-emerald dark:group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="mt-8">
                    <h3 className="font-display text-lg font-bold text-ink">{p.name}</h3>
                    <p className="mt-1 text-sm text-subtle">{p.count} verified</p>
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
