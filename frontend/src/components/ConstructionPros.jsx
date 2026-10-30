import React from "react";
import * as Lucide from "lucide-react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { PROFESSIONALS } from "@/data/content";
import { Reveal, Stagger, StaggerItem } from "@/components/anim/Reveal";
import { useLeadForm } from "@/context/LeadFormProvider";

export default function FixaSection() {
  const { openForm } = useLeadForm();
  return (
    <section id="fixa" className="bg-background py-20 sm:py-24 md:py-32" data-testid="fixa-section">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <Reveal>
            <div className="inline-flex items-center gap-3 rounded-2xl bg-[#4CD964]/10 px-4 py-2">
              <img src="/fixa-pro.png" alt="FIXA PRO" className="h-10 w-10 rounded-xl object-cover" />
              <div>
                <p className="font-display text-xl font-black tracking-tight text-[#1BBF4C]">FIXA</p>
                <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">Home Services Network</p>
              </div>
            </div>
            <h2 className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
              Trusted home services, booked in-app.
            </h2>
            <p className="mt-5 max-w-md text-base text-subtle md:text-lg">
              FIXA connects AMASS homeowners with vetted professionals for every repair and upgrade —
              plumbers, electricians, painters, cleaners and more. Changing the way we work and bringing
              dignity to labour through technology.
            </p>

            <div className="mt-8 flex flex-wrap gap-3" data-testid="fixa-ctas">
              <button
                onClick={() => openForm("contact")}
                data-testid="fixa-book-cta"
                className="group flex items-center gap-2 rounded-full bg-[#1BBF4C] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_32px_rgba(27,191,76,0.3)] transition-transform hover:scale-[1.03]"
              >
                Book a FIXA Pro
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                onClick={() => openForm("fixa_provider")}
                data-testid="fixa-apply-cta"
                className="rounded-full border border-hairline bg-background px-7 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                Apply as a FIXA Pro
              </button>
            </div>
            <p className="mt-3 text-xs text-subtle">
              Applications are reviewed. Approval is required before you can offer services on FIXA.
            </p>
          </Reveal>

          <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4" stagger={0.05}>
            {PROFESSIONALS.map((p) => {
              const Icon = Lucide[p.icon] || Lucide.Wrench;
              return (
                <StaggerItem key={p.name}>
                  <motion.div
                    whileHover={{ y: -6 }}
                    className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-hairline bg-surface p-5 shadow-soft"
                    data-testid={`pro-${p.name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#1BBF4C] text-white transition-colors">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="mt-6">
                      <h3 className="font-display text-base font-bold text-ink">{p.name}</h3>
                      <p className="mt-1 text-xs text-subtle">{p.count} verified</p>
                    </div>
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
