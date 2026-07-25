import React, { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, ArrowUpRight } from "lucide-react";
import { CATEGORIES } from "@/data/content";
import { Reveal } from "@/components/anim/Reveal";
import { IMAGES } from "@/data/content";

export default function CategorySection() {
  const [active, setActive] = useState(CATEGORIES[0].id);
  const activeCat = CATEGORIES.find((c) => c.id === active);

  return (
    <section id="explore-map" className="relative overflow-hidden bg-brand-charcoal py-24 md:py-32">
      {/* subtle satellite backdrop */}
      <div className="absolute inset-0 opacity-25">
        <img src={IMAGES.heroAerial} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90" />

      <div className="relative mx-auto max-w-[1400px] px-6 md:px-12">
        <Reveal>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-brand-gold">
            <MapPin className="h-4 w-4" /> Live Map Experience
          </p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl">
            One intelligent map. Every category of property.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
          {/* Preview image */}
          <Reveal delay={0.1} className="relative overflow-hidden rounded-4xl border border-white/10">
            <motion.img
              key={activeCat.id}
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              src={activeCat.image}
              alt={activeCat.name}
              className="h-[380px] w-full object-cover md:h-[460px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-6 left-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-gold">{activeCat.count} listings</p>
              <p className="font-display text-3xl font-bold text-white">{activeCat.name}</p>
            </div>
            <span className="absolute right-6 top-6 flex items-center gap-1 rounded-full glass-dark border border-white/15 px-3 py-1.5 text-xs font-medium text-white">
              <span className="h-2 w-2 animate-marker-pulse rounded-full bg-brand-emerald" /> Live
            </span>
          </Reveal>

          {/* Category list */}
          <div className="flex flex-col gap-2">
            {CATEGORIES.map((c, i) => (
              <motion.button
                key={c.id}
                onMouseEnter={() => setActive(c.id)}
                onFocus={() => setActive(c.id)}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
                data-testid={`category-${c.id}`}
                className={`group flex items-center justify-between rounded-2xl border px-6 py-5 text-left transition-all duration-300 ${
                  active === c.id
                    ? "border-brand-emerald/60 bg-white/10"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-xs text-white/40">0{i + 1}</span>
                  <span className="font-display text-xl font-semibold text-white md:text-2xl">{c.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/50">{c.count}</span>
                  <ArrowUpRight className={`h-5 w-5 transition-all ${active === c.id ? "text-brand-emerald" : "text-white/30 group-hover:text-white"}`} />
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
