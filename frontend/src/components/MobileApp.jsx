import React from "react";
import { motion } from "framer-motion";
import { Apple, Play, Sparkles, Map, MessageCircle } from "lucide-react";
import { Reveal } from "@/components/anim/Reveal";

const SCREENS = [
  { img: "https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=600&auto=format&fit=crop", label: "Map", rotate: -6, y: 30 },
  { img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=600&auto=format&fit=crop", label: "Property", rotate: 0, y: 0 },
  { img: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=600&auto=format&fit=crop", label: "AI Assistant", rotate: 6, y: 30 },
];

function Phone({ screen, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotate: screen.rotate }}
      whileInView={{ opacity: 1, y: screen.y, rotate: screen.rotate }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.15, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className={`relative ${index === 1 ? "z-20" : "z-10"} animate-float`}
      style={{ animationDelay: `${index * 0.6}s` }}
      data-testid={`phone-${screen.label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <div className="relative h-[460px] w-[224px] rounded-[2.6rem] border-[10px] border-brand-charcoal bg-brand-charcoal shadow-floating dark:border-[#22242a]">
        <div className="absolute left-1/2 top-2.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className="relative h-full w-full overflow-hidden rounded-[2rem]">
          <img src={screen.img} alt={screen.label} loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="absolute bottom-4 left-4 rounded-full glass-dark border border-white/15 px-3 py-1.5 text-xs font-semibold text-white">
            {screen.label}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function MobileApp() {
  return (
    <section className="relative overflow-hidden bg-background py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-brand-emerald">
              <Sparkles className="h-4 w-4" /> AMASS Mobile
            </p>
            <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
              The entire property market, in your pocket.
            </h2>
            <p className="mt-6 max-w-md text-base text-subtle md:text-lg">
              Explore satellite maps, chat with verified agents, get AI valuations and complete
              transactions — with a beautiful light and dark experience.
            </p>

            <div className="mt-8 flex flex-wrap gap-4 text-sm text-subtle">
              <span className="flex items-center gap-2"><Map className="h-4 w-4 text-brand-emerald" /> Live Map</span>
              <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-emerald" /> AI Assistant</span>
              <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-brand-emerald" /> Secure Messages</span>
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <button data-testid="app-store-btn" className="flex items-center gap-3 rounded-2xl bg-brand-charcoal px-6 py-3.5 text-white transition-transform hover:scale-[1.03] dark:bg-white dark:text-black">
                <Apple className="h-6 w-6" />
                <span className="text-left leading-tight">
                  <span className="block text-[10px] uppercase tracking-wide opacity-70">Download on the</span>
                  <span className="block text-sm font-semibold">App Store</span>
                </span>
              </button>
              <button data-testid="play-store-btn" className="flex items-center gap-3 rounded-2xl border border-hairline px-6 py-3.5 text-ink transition-colors hover:bg-surface">
                <Play className="h-6 w-6 text-brand-emerald" />
                <span className="text-left leading-tight">
                  <span className="block text-[10px] uppercase tracking-wide opacity-70">Get it on</span>
                  <span className="block text-sm font-semibold">Google Play</span>
                </span>
              </button>
            </div>
          </Reveal>

          <div className="relative flex items-end justify-center gap-[-2rem]">
            <div className="absolute inset-0 -z-10 mx-auto h-72 w-72 self-center rounded-full bg-brand-emerald/15 blur-3xl" />
            <div className="flex items-end -space-x-8">
              {SCREENS.map((s, i) => <Phone key={s.label} screen={s} index={i} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
