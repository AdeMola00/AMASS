import React from "react";

/**
 * Official AMASS logo — used exactly as supplied (public/amass-logo.png).
 * On dark surfaces the logo sits on a clean white keyline chip so the
 * black wordmark stays legible without altering the artwork itself.
 */
export default function Logo({ height = 30, chip = false, className = "" }) {
  const img = (
    <img
      src="/amass-logo.png"
      alt="AMASS"
      style={{ height, width: "auto" }}
      className="block select-none"
      draggable="false"
    />
  );

  if (chip) {
    return (
      <span className={`inline-flex items-center rounded-xl bg-white px-3 py-1.5 shadow-sm ${className}`}>
        {img}
      </span>
    );
  }
  return <span className={`inline-flex items-center ${className}`}>{img}</span>;
}
