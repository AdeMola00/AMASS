import React from "react";
import { FAQS } from "@/data/content";
import { Reveal } from "@/components/anim/Reveal";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

export default function FAQSection() {
  return (
    <section id="faq" className="bg-background py-24 md:py-32">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-6 md:px-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-emerald">FAQ</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-5xl">
            Questions,<br />answered.
          </h2>
          <p className="mt-6 max-w-sm text-base text-subtle">
            Everything you need to know about buying, listing and building with AMASS.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <Accordion type="single" collapsible className="w-full" data-testid="faq-accordion">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-b border-hairline">
                <AccordionTrigger
                  data-testid={`faq-trigger-${i}`}
                  className="py-6 text-left font-display text-lg font-semibold text-ink hover:no-underline md:text-xl"
                >
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-base leading-relaxed text-subtle">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
