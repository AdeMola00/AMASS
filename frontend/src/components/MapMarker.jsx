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

// Glossy teardrop pin (matches the AMASS brand mark), tinted per status.
function StatusPin({ color }) {
  const gid = React.useId();
  return (
    <svg width="34" height="44" viewBox="0 0 48 60" fill="none" className="origin-bottom drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]">
      <defs>
        <radialGradient id={`${gid}-g`} cx="0.34" cy="0.26" r="0.6">
          <stop stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M24 2C13.5 2 5 10.3 5 20.6c0 8.6 8.2 20.5 15.9 33.2a3.6 3.6 0 0 0 6.2 0C34.8 41.1 43 29.2 43 20.6 43 10.3 34.5 2 24 2Z"
        fill={color}
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.5"
      />
      <path
        d="M24 2C13.5 2 5 10.3 5 20.6c0 8.6 8.2 20.5 15.9 33.2a3.6 3.6 0 0 0 6.2 0C34.8 41.1 43 29.2 43 20.6 43 10.3 34.5 2 24 2Z"
        fill={`url(#${gid}-g)`}
      />
      <circle cx="24" cy="20.5" r="7.6" fill="#FFFFFF" />
    </svg>
  );
}

export default function MapMarker({ marker }) {
  const [hover, setHover] = useState(false);
  const color = COLOR[marker.status];
  const leftPct = parseInt(marker.left);

  // Card horizontal alignment relative to the pin tip (the coordinate point).
  let cardStyle = { left: "50%", transform: "translateX(-50%)" };
  if (leftPct < 24) cardStyle = { left: 0 };
  else if (leftPct > 60) cardStyle = { right: 0 };

  return (
    <motion.div
      className="absolute z-20"
      style={{ top: marker.top, left: marker.left }}
      initial={{ opacity: 0, y: -26, scale: 0.4 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: marker.delay, duration: 0.7, ease: [0.16, 1, 0.3, 1], type: "spring", stiffness: 200, damping: 16 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={`map-marker-${marker.id}`}
    >
      {/* Pulsing halo pinned to the ground point (tip) */}
      <span
        className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-ping-ring rounded-full"
        style={{ backgroundColor: color }}
      />
      <span
        className="absolute left-0 top-0 h-1.5 w-3 -translate-x-1/2 translate-y-0.5 rounded-[50%] bg-black/40 blur-[2px]"
      />

      {/* Pin — its pointed tip sits exactly on the coordinate */}
      <button
        className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full animate-marker-pulse"
        style={{ transformOrigin: "bottom center" }}
        aria-label={marker.title}
      >
        <StatusPin color={color} />
      </button>

      {/* Preview card floats above the pin */}
      <motion.div
        initial={false}
        animate={hover
          ? { opacity: 1, y: 0, scale: 1, pointerEvents: "auto" }
          : { opacity: 0, y: 8, scale: 0.96, pointerEvents: "none" }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="absolute w-64 overflow-hidden rounded-3xl glass-light border border-white/20 shadow-floating"
        style={{ bottom: 56, ...cardStyle }}
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
      {MARKERS.map((m) => (
        <MapMarker key={m.id} marker={m} />
      ))}
    </>
  );
}
