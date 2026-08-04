import React from "react";

export const AmassLogo = ({ size = 32, className = "", inverse = false }) => {
  const red = "#E11B22";
  const ink = inverse ? "#FFFFFF" : "#0A0A0A";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M20 4C13 4 8 9.5 8 16.5C8 24 20 36 20 36C20 36 32 24 32 16.5C32 9.5 27 4 20 4Z"
          fill={red}
        />
        <circle cx="20" cy="16.5" r="4.5" fill="#FFFFFF" />
      </svg>
      <span
        className="font-display text-xl font-normal tracking-tight"
        style={{ color: ink, letterSpacing: "-0.03em" }}
      >
        AMASS
      </span>
    </div>
  );
};
