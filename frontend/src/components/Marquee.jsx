import React from "react";

const WORDS = ["Discover", "Verify", "Finance", "Buy", "Rent", "Build", "Furnish", "Manage"];

export default function Marquee() {
  const items = [...WORDS, ...WORDS];
  return (
    <section className="border-y border-hairline bg-surface py-8 md:py-10" data-testid="marquee">
      <div className="flex overflow-hidden">
        <div className="flex shrink-0 animate-marquee items-center gap-10 pr-10">
          {items.map((w, i) => (
            <span key={i} className="flex items-center gap-10">
              <span className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-6xl">
                {w}
              </span>
              <span className="h-2.5 w-2.5 rounded-full bg-brand-gold" />
            </span>
          ))}
        </div>
        <div className="flex shrink-0 animate-marquee items-center gap-10 pr-10" aria-hidden="true">
          {items.map((w, i) => (
            <span key={i} className="flex items-center gap-10">
              <span className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-6xl">
                {w}
              </span>
              <span className="h-2.5 w-2.5 rounded-full bg-brand-gold" />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
