import React, { useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, BedDouble, Bath, Maximize, Home } from "lucide-react";
import { MARKERS } from "@/data/content";

const COLOR = {
  available: "var(--m-available)",
  coming_soon: "var(--m-coming)",
  verified: "var(--m-verified)",
  premium: "var(--m-premium)",
  sold: "var(--m-sold)",
};

export default function MapMarker({ marker, index }) {
  const [hover, setHover] = useState(false);
  const color = COLOR[marker.status];
  // Cards near right edge open to the left
  const rightSide = parseInt(marker.left) > 62;

  return (
    <motion.div
      className="absolute z-20"
      style={{ top: marker.top, left: marker.left }}
      initial={{ opacity: 0, scale: 0, y: -20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: marker.delay, duration: 0.6, ease: [0.16, 1, 0.3, 1], type: "spring", stiffness: 220, damping: 18 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={`map-marker-${marker.id}`}
    >
      {/* Pin */}
      <button className="relative -translate-x-1/2 -translate-y-1/2" aria-label={marker.title}>
        <span
          className="absolute inset-0 -z-10 rounded-full animate-ping-ring"
          style={{ backgroundColor: color }}
        />
        <span
          className="block h-4 w-4 animate-marker-pulse rounded-full ring-4 ring-white/70 dark:ring-white/20"
          style={{ backgroundColor: color, boxShadow: `0 0 18px ${color}` }}
        />
      </button>

      {/* Preview card */}
      <motion.div
        initial={false}
        animate={hover ? { opacity: 1, y: 0, scale: 1, pointerEvents: "auto" } : { opacity: 0, y: 10, scale: 0.96, pointerEvents: "none" }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className={`absolute bottom-6 w-64 overflow-hidden rounded-3xl glass-light border border-white/20 shadow-floating ${
          rightSide ? "right-0" : "left-0"
        }`}
        data-testid={`marker-card-${marker.id}`}
      >
        <div className="relative h-32 overflow-hidden">
          <img src={marker.image} alt={marker.title} className="h-full w-full object-cover" loading="lazy" />
          <span
            className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: color }}
          >
            {marker.status.replace("_", " ")}
          </span>
        </div>
        <div className="p-4 text-left">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-bold text-ink">{marker.price}</p>
            {marker.verified && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-brand-emerald">
                <BadgeCheck className="h-3.5 w-3.5" /> Verified
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-ink">{marker.title}</p>
          <p className="text-xs text-subtle">{marker.address}</p>
          <div className="mt-3 flex items-center gap-3 border-t border-hairline pt-3 text-[11px] text-subtle">
            <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{marker.beds}</span>
            <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{marker.baths}</span>
            <span className="flex items-center gap-1"><Maximize className="h-3.5 w-3.5" />{marker.sqm}m²</span>
            <span className="flex items-center gap-1"><Home className="h-3.5 w-3.5" />{marker.type}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function MarkerField() {
  return (
    <>
      {MARKERS.map((m, i) => (
        <MapMarker key={m.id} marker={m} index={i} />
      ))}
    </>
  );
}
