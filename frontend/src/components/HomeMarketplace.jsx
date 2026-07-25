import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { HOME_PRODUCTS } from "@/data/content";
import { Reveal } from "@/components/anim/Reveal";

export default function HomeMarketplace() {
  return (
    <section className="bg-surface py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-emerald">Home Marketplace</p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
            Furnish every corner, beautifully.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {HOME_PRODUCTS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 4) * 0.07, duration: 0.6 }}
              className={`group relative overflow-hidden rounded-4xl border border-hairline bg-background shadow-soft ${
                i === 0 ? "md:col-span-2 md:row-span-2" : ""
              }`}
              data-testid={`home-product-${p.name.toLowerCase()}`}
            >
              <div className={`relative overflow-hidden ${i === 0 ? "h-64 md:h-full md:min-h-[380px]" : "h-44"}`}>
                <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex items-center justify-between p-5">
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">{p.name}</h3>
                  <p className="text-sm text-subtle">{p.price}</p>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink transition-colors group-hover:bg-brand-emerald group-hover:text-white">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
