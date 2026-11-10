import React from "react";
import { useLeadForm } from "@/context/LeadFormProvider";

/** Apple brand mark (official silhouette). */
function AppleLogo({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** Google Play brand mark (official four-colour triangle). */
function GooglePlayLogo({ className = "" }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path fill="#00D2FF" d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z" />
      <path fill="#FFCE00" d="M385.4 174.2l-60.1 60.1 60.1 60.1 79.2-45.6c17.8-10.2 17.8-27.8 0-38l-79.2-36.6z" />
      <path fill="#FF3A44" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z" />
      <path fill="#00F076" d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
    </svg>
  );
}

/**
 * Official-style App Store + Google Play badges.
 * Tapping either badge opens the launch waiting-list form (apps ship soon).
 */
export function StoreBadges({ size = "md", testids = {}, className = "", withIcon = true }) {
  const { openForm } = useLeadForm();
  const notify = () => openForm("waiting_list");
  const lg = size === "lg";
  const box = lg
    ? "gap-4 rounded-2xl px-6 py-3.5 sm:px-8 sm:py-4"
    : "gap-3 rounded-xl px-5 py-3";
  const icon = lg ? "h-8 w-8 sm:h-10 sm:w-10" : "h-7 w-7";
  const caption = lg ? "text-[10px] sm:text-[11px]" : "text-[10px]";
  const title = lg ? "text-lg sm:text-xl" : "text-base";

  return (
    <div className={`flex flex-wrap items-center gap-3 sm:gap-4 ${className}`}>
      {withIcon && (
        <img
          src="/amass-app-icon.png"
          alt="AMASS app"
          data-testid={testids.icon || "amass-app-icon"}
          className={`shrink-0 rounded-2xl border border-white/25 shadow-floating ${lg ? "h-16 w-16 sm:h-[4.75rem] sm:w-[4.75rem]" : "h-14 w-14"}`}
          draggable="false"
        />
      )}
      <button
        onClick={notify}
        data-testid={testids.ios || "app-store-btn"}
        aria-label="Download on the App Store"
        className={`flex items-center border border-white/25 bg-black text-white shadow-floating transition-transform hover:scale-[1.05] ${box}`}
      >
        <AppleLogo className={`shrink-0 ${icon}`} />
        <span className="text-left leading-tight">
          <span className={`block font-medium uppercase tracking-wider opacity-70 ${caption}`}>Download on the</span>
          <span className={`block font-bold ${title}`}>App Store</span>
        </span>
      </button>
      <button
        onClick={notify}
        data-testid={testids.android || "play-store-btn"}
        aria-label="Get it on Google Play"
        className={`flex items-center border border-white/25 bg-black text-white shadow-floating transition-transform hover:scale-[1.05] ${box}`}
      >
        <GooglePlayLogo className={`shrink-0 ${icon}`} />
        <span className="text-left leading-tight">
          <span className={`block font-medium uppercase tracking-wider opacity-70 ${caption}`}>Get it on</span>
          <span className={`block font-bold ${title}`}>Google Play</span>
        </span>
      </button>
    </div>
  );
}

export default StoreBadges;
