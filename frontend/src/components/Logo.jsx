import React from "react";

/**
 * AMASS logo — glossy map-pin mark recolored to the emerald brand theme,
 * plus the AMASS wordmark. Theme-adaptive (wordmark uses currentColor).
 */
export function AmassPin({ size = 36, className = "" }) {
  const id = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 60"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="10" y1="4" x2="38" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF6B6B" />
          <stop offset="0.45" stopColor="#ED2029" />
          <stop offset="1" stopColor="#B3141F" />
        </linearGradient>
        <radialGradient id={`${id}-gloss`} cx="0.35" cy="0.28" r="0.6">
          <stop stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-40%" y="-20%" width="180%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#B3141F" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Teardrop pin body */}
      <path
        d="M24 2C13.5 2 5 10.3 5 20.6c0 8.6 8.2 20.5 15.9 33.2a3.6 3.6 0 0 0 6.2 0C34.8 41.1 43 29.2 43 20.6 43 10.3 34.5 2 24 2Z"
        fill={`url(#${id}-body)`}
        filter={`url(#${id}-shadow)`}
      />
      {/* Glossy highlight */}
      <path
        d="M24 2C13.5 2 5 10.3 5 20.6c0 8.6 8.2 20.5 15.9 33.2a3.6 3.6 0 0 0 6.2 0C34.8 41.1 43 29.2 43 20.6 43 10.3 34.5 2 24 2Z"
        fill={`url(#${id}-gloss)`}
        opacity="0.9"
      />
      {/* Center hole */}
      <circle cx="24" cy="20.5" r="8.2" fill="#FFFFFF" />
      <circle cx="24" cy="20.5" r="8.2" fill={`url(#${id}-gloss)`} opacity="0.25" />
    </svg>
  );
}

export default function Logo({ pinSize = 34, textClass = "text-ink", className = "" }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <AmassPin size={pinSize} />
      <span className={`font-display text-2xl font-black tracking-tight ${textClass}`}>AMASS</span>
    </span>
  );
}
