import React, { useRef } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, BedDouble, Bath, Maximize, MapPin, ArrowLeft, ArrowRight } from "lucide-react";
import { PROPERTIES } from "@/data/content";
import { Reveal } from "@/components/anim/Reveal";
import { useLeadForm } from "@/context/LeadFormProvider";

const TAG_COLOR = {
  Premium: "var(--m-premium)",
  Available: "var(--m-available)",
  Verified: "var(--m-verified)",
  "Coming Soon": "var(--m-coming)",
  "Short Let": "var(--m-verified)",
};

export default function PropertyShowcase() {
  const trackRef = useRef(null);
  const { openForm } = useLeadForm();

  const scroll = (dir) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section id="showcase" className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-emerald">Property Showcase</p>
            <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
              Handpicked homes,<br />verified to the last detail.
            </h2>
          </Reveal>
          <div className="flex gap-3">
            <button onClick={() => scroll(-1)} data-testid="showcase-prev" className="grid h-12 w-12 place-items-center rounded-full border border-hairline text-ink transition-colors hover:bg-surface" aria-label="Previous">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button onClick={() => scroll(1)} data-testid="showcase-next" className="grid h-12 w-12 place-items-center rounded-full border border-hairline text-ink transition-colors hover:bg-surface" aria-label="Next">
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div ref={trackRef} className="no-scrollbar mt-14 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4">
          {PROPERTIES.map((p, i) => (
            <motion.article
              key={p.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 3) * 0.08, duration: 0.6 }}
              className="group w-[300px] shrink-0 snap-start overflow-hidden rounded-4xl border border-hairline bg-surface shadow-soft sm:w-[360px]"
              data-testid={`property-${p.id}`}
            >
              <div className="relative h-60 overflow-hidden">
                <img src={p.image} alt={p.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <span className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: TAG_COLOR[p.tag] || "var(--m-available)" }}>
                  {p.tag}
                </span>
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent" />
                <p className="absolute bottom-4 left-4 font-display text-2xl font-bold text-white">{p.price}</p>
              </div>
              <div className="p-6">
                <h3 className="font-display text-xl font-bold text-ink">{p.title}</h3>
                <p className="mt-1 flex items-center gap-1 text-sm text-subtle"><MapPin className="h-3.5 w-3.5" />{p.location}</p>
                <div className="mt-4 flex items-center gap-4 border-y border-hairline py-4 text-sm text-subtle">
                  <span className="flex items-center gap-1.5"><BedDouble className="h-4 w-4" />{p.beds}</span>
                  <span className="flex items-center gap-1.5"><Bath className="h-4 w-4" />{p.baths}</span>
                  <span className="flex items-center gap-1.5"><Maximize className="h-4 w-4" />{p.sqm}m²</span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{p.agent}</span>
                  {p.verified && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-brand-emerald">
                      <BadgeCheck className="h-4 w-4" /> Verified Agent
                    </span>
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        <Reveal delay={0.1} className="mt-10">
          <button onClick={() => openForm("waiting_list")} data-testid="showcase-cta" className="rounded-full bg-brand-charcoal px-8 py-4 text-sm font-semibold text-white transition-transform hover:scale-[1.03] dark:bg-white dark:text-black">
            See all 48,000+ listings
          </button>
        </Reveal>
      </div>
    </section>
  );
}
