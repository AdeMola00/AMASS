import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { STATS } from "@/data/content";
import { Reveal } from "@/components/anim/Reveal";

const FEATURES = [
  "Verified Agents", "Verified Documents", "Fast Property Search",
  "Secure Transactions", "Interactive Maps", "AI-Powered Insights",
];

function CountUp({ value }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const match = String(value).match(/^([^\d]*)([\d.,]+)(.*)$/);
    if (!inView || !match) { setDisplay(value); return; }
    const prefix = match[1];
    const target = parseFloat(match[2].replace(/,/g, ""));
    const suffix = match[3];
    const decimals = match[2].includes(".") ? 1 : 0;
    const useComma = match[2].includes(",");
    let start = 0;
    const duration = 1400;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = start + (target - start) * eased;
      let num = cur.toFixed(decimals);
      if (useComma) num = Number(num).toLocaleString();
      setDisplay(`${prefix}${num}${suffix}`);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return <span ref={ref}>{display}</span>;
}

export default function Stats() {
  return (
    <section className="relative overflow-hidden bg-brand-emerald py-24 md:py-32" data-testid="stats">
      <div className="absolute inset-0 grain opacity-[0.15]" />
      <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="relative mx-auto max-w-[1400px] px-6 md:px-12">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">Why Choose AMASS</p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl">
            Trusted by a nation. Built for a continent.
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-3 lg:grid-cols-6">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.6 }}
              data-testid={`stat-${i}`}
            >
              <p className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
                <CountUp value={s.value} />
              </p>
              <p className="mt-2 text-sm text-white/70">{s.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap gap-3 border-t border-white/15 pt-10">
          {FEATURES.map((f) => (
            <span key={f} className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white">
              {f}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
