import React from "react";
import * as Lucide from "lucide-react";
import { motion } from "framer-motion";
import { STEPS } from "@/data/content";
import { Reveal } from "@/components/anim/Reveal";

export default function HowItWorks() {
  return (
    <section id="how" className="relative bg-surface py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-emerald">How It Works</p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
            From first search to keys in hand — in five steps.
          </h2>
        </Reveal>

        <div className="relative mt-20">
          {/* connecting line */}
          <div className="absolute left-0 right-0 top-7 hidden h-px bg-hairline lg:block" />
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "left" }}
            className="absolute left-0 right-0 top-7 hidden h-px bg-brand-emerald lg:block"
          />

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => {
              const Icon = Lucide[s.icon] || Lucide.Circle;
              return (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12, duration: 0.6 }}
                  className="relative"
                  data-testid={`step-${s.n}`}
                >
                  <span className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl bg-background text-brand-emerald shadow-soft ring-1 ring-hairline">
                    <Icon className="h-6 w-6" />
                  </span>
                  <p className="mt-6 font-mono text-sm text-subtle/60">{s.n}</p>
                  <h3 className="mt-1 font-display text-2xl font-bold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-subtle">{s.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
