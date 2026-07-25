import React from "react";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { TESTIMONIALS } from "@/data/content";
import { Reveal } from "@/components/anim/Reveal";

export default function Testimonials() {
  return (
    <section className="bg-surface py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-emerald">Testimonials</p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
            Loved by buyers, investors and builders alike.
          </h2>
        </Reveal>

        <div className="mt-14 columns-1 gap-6 md:columns-2 lg:columns-3 [&>*]:mb-6">
          {TESTIMONIALS.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 3) * 0.08, duration: 0.6 }}
              className="break-inside-avoid rounded-4xl border border-hairline bg-background p-8 shadow-soft"
              data-testid={`testimonial-${i}`}
            >
              <Quote className="h-8 w-8 text-brand-emerald/30" />
              <blockquote className="mt-4 text-base leading-relaxed text-ink">“{t.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <img src={t.avatar} alt={t.name} loading="lazy" className="h-11 w-11 rounded-full object-cover" />
                <div>
                  <p className="text-sm font-semibold text-ink">{t.name}</p>
                  <p className="text-xs text-subtle">{t.role}</p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
