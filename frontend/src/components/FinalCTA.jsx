import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Download } from "lucide-react";
import { IMAGES } from "@/data/content";
import { Reveal } from "@/components/anim/Reveal";
import { useLeadForm } from "@/context/LeadFormProvider";
import { scrollToSection } from "@/context/SmoothScroll";
import Magnetic from "@/components/anim/Magnetic";

export default function FinalCTA() {
  const { openForm } = useLeadForm();
  return (
    <section className="px-4 pb-4 md:px-6 md:pb-6">
      <div className="relative mx-auto max-w-[1600px] overflow-hidden rounded-[2.5rem] bg-brand-charcoal py-24 md:py-40">
        <div className="absolute inset-0 opacity-30">
          <img src={IMAGES.heroAerial} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/85" />
        <div className="absolute inset-0 grain opacity-10" />

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-gold">Start Today</p>
            <h2 className="mt-5 font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Find Your Next Property Today
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base text-white/75 md:text-lg">
              Join the platform redefining how Africa discovers, verifies and owns property.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Magnetic>
                <button
                  onClick={() => scrollToSection("#showcase")}
                  data-testid="final-explore-btn"
                  className="group flex items-center gap-2 rounded-full bg-brand-emerald px-9 py-4 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.03]"
                >
                  Explore Properties
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
              </Magnetic>
              <Magnetic>
                <button
                  onClick={() => openForm("waiting_list")}
                  data-testid="final-download-btn"
                  className="flex items-center gap-2 rounded-full border border-white/30 glass-dark px-9 py-4 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-black"
                >
                  <Download className="h-4 w-4" /> Download App
                </button>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
