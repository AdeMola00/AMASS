import { cn } from "@/lib/utils";

// AMASS location-pin mark — vivid red teardrop with a hollow center, matching the brand logo.
export function AmassPin({ className }) {
  return (
    <svg viewBox="0 0 48 60" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="amassPinGrad" cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#FF5A5A" />
          <stop offset="45%" stopColor="#F01414" />
          <stop offset="100%" stopColor="#B00000" />
        </radialGradient>
      </defs>
      <path
        d="M24 2C13 2 4 10.7 4 21.4 4 35 24 58 24 58s20-23 20-36.6C44 10.7 35 2 24 2z"
        fill="url(#amassPinGrad)"
      />
      <circle cx="24" cy="21" r="8.4" fill="#fff" />
    </svg>
  );
}

export function Logo({ withWordmark = true, className, textClass, pinClass }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AmassPin className={cn("h-8 w-8 drop-shadow-sm", pinClass)} />
      {withWordmark && (
        <span className={cn("font-heading font-extrabold tracking-tight text-lg", textClass)}>AMASS</span>
      )}
    </div>
  );
}
