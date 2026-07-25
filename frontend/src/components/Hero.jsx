import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Lock, MapPinned } from "lucide-react";
import { IMAGES, TRUST, MARKER_LEGEND } from "@/data/content";
import { MarkerField } from "@/components/MapMarker";
import { useLeadForm } from "@/context/LeadFormProvider";
import Magnetic from "@/components/anim/Magnetic";

const EASE = [0.16, 1, 0.3, 1];
const TRUST_ICONS = [ShieldCheck, Sparkles, Lock, MapPinned];

const LINES = ["Discover Africa's", "Properties Like", "Never Before"];

function MaskedHeading() {
  return (
    <h1 className="font-display text-[2.6rem] font-extrabold leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-[5.5rem]">
      {LINES.map((line, i) => (
        <span key={i} className="block overflow-hidden py-[0.05em]">
          <motion.span
            className="block"
            initial={{ y: "110%" }}
            animate={{ y: "0%" }}
            transition={{ delay: 0.35 + i * 0.13, duration: 1, ease: EASE }}
          >
            {i === 2 ? (
              <span className="text-gradient-gold">{line}</span>
            ) : (
              line
            )}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

export default function Hero() {
  const { openForm } = useLeadForm();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 1], [1, 1.4]);

  return (
    <section ref={ref} id="top" className="relative isolate h-[100svh] min-h-[720px] w-full overflow-hidden bg-brand-charcoal">
      {/* Aerial background with parallax */}
      <motion.div style={{ y, scale }} className="absolute inset-0 z-0">
        <img
          src={IMAGES.heroAerial}
          alt="Aerial view of Lagos, Nigeria"
          className="h-full w-full object-cover"
          fetchpriority="high"
        />
      </motion.div>
      <motion.div
        style={{ opacity: overlayOpacity }}
        className="absolute inset-0 z-[1] bg-gradient-to-b from-black/55 via-black/30 to-black/85"
      />
      <div className="absolute inset-0 z-[1] bg-[radial-gradient(120%_80%_at_20%_10%,rgba(0,0,0,0.35),transparent)]" />

      {/* Live markers (hidden on very small screens to keep hero text clean) */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        <div className="pointer-events-auto absolute inset-0">
          <MarkerField />
        </div>
      </div>

      {/* Mobile-only floating pin accents (decorative, non-overlapping) */}
      <div className="pointer-events-none absolute inset-0 sm:hidden" data-testid="hero-mobile-pins">
        <span className="absolute right-6 top-[16%] h-3.5 w-3.5 animate-marker-pulse rounded-full ring-4 ring-white/50" style={{ backgroundColor: "var(--m-verified)" }} />
        <span className="absolute right-16 top-[26%] h-3 w-3 animate-marker-pulse rounded-full ring-4 ring-white/40" style={{ backgroundColor: "var(--m-premium)" }} />
        <span className="absolute left-8 top-[20%] h-3 w-3 animate-marker-pulse rounded-full ring-4 ring-white/40" style={{ backgroundColor: "var(--m-available)" }} />
      </div>

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.4, duration: 0.8, ease: EASE }}
        className="absolute right-4 top-28 z-30 hidden flex-col gap-2 rounded-2xl glass-dark border border-white/10 p-4 md:flex"
        data-testid="marker-legend"
      >
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Live Listings</p>
        {MARKER_LEGEND.map((l) => (
          <div key={l.status} className="flex items-center gap-2 text-xs text-white/90">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            {l.label}
          </div>
        ))}
      </motion.div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-6 pb-24 md:px-12 md:pb-32">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-white/80"
        >
          <span className="h-px w-8 bg-brand-gold" /> The Google Maps of African Real Estate
        </motion.p>

        <MaskedHeading />

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8 }}
          className="mt-6 max-w-xl text-base text-white/85 md:text-lg"
        >
          The AMASS app lets you search, verify, buy, rent, finance and explore properties with
          intelligent maps, verified listings and AI-powered property intelligence.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.8 }}
          className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
        >
          <Magnetic className="w-full sm:w-auto">
            <button
              onClick={() => openForm("waiting_list")}
              data-testid="hero-getapp-btn"
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-brand-emerald px-8 py-4 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.03] sm:w-auto"
            >
              Get Early Access
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </Magnetic>
          <Magnetic className="w-full sm:w-auto">
            <button
              onClick={() => openForm("become_agent")}
              data-testid="hero-agent-btn"
              className="w-full rounded-full border border-white/30 glass-dark px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-black sm:w-auto"
            >
              Become an Agent
            </button>
          </Magnetic>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.9 }}
          className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3"
        >
          {TRUST.map((t, i) => {
            const Icon = TRUST_ICONS[i];
            return (
              <div key={t} className="flex items-center gap-2 text-sm font-medium text-white/85">
                <Icon className="h-4 w-4 text-brand-gold" /> {t}
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
