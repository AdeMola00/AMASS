import React from "react";
import { useContent } from "@/context/ContentProvider";

/**
 * AMASS logo — CMS-driven via branding.logo_url (set from AMASS ADMIN),
 * falling back to the bundled artwork (public/amass-logo.png) when unset.
 * On dark surfaces the logo sits on a clean white keyline chip so the
 * black wordmark stays legible without altering the artwork itself.
 */
export default function Logo({ height = 30, chip = false, className = "" }) {
  const { branding } = useContent();
  const img = (
    <img
      src={branding?.logo_url || "/amass-logo.png"}
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
