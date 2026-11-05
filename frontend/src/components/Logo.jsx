import { cn } from "@/lib/utils";

const SRC = {
  mark: ["/amass-mark.png", "/amass-mark-dark.png"],
  wordmark: ["/amass-wordmark.png", "/amass-wordmark-dark.png"],
  full: ["/amass-logo.png", "/amass-logo-dark.png"],
};

// Official AMASS logo artwork; `onDark` forces the light-on-dark version, otherwise it follows the theme.
function BrandImage({ kind, className, onDark, testid }) {
  const [light, dark] = SRC[kind];
  if (onDark) return <img src={dark} alt="AMASS" className={cn("object-contain", className)} data-testid={testid} />;
  return (
    <>
      <img src={light} alt="AMASS" className={cn("object-contain dark:hidden", className)} data-testid={testid} />
      <img src={dark} alt="AMASS" className={cn("object-contain hidden dark:block", className)} />
    </>
  );
}

export function AmassPin({ className, onDark }) {
  return <BrandImage kind="mark" className={cn("w-auto", className)} onDark={onDark} />;
}

export function AmassWordmark({ className, onDark }) {
  return <BrandImage kind="wordmark" className={cn("w-auto", className)} onDark={onDark} />;
}

export function AmassLogoFull({ className, onDark, testid }) {
  return <BrandImage kind="full" className={cn("w-auto", className)} onDark={onDark} testid={testid} />;
}

export function Logo({ withWordmark = true, className, pinClass, onDark }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AmassPin className={cn("h-8", pinClass)} onDark={onDark} />
      {withWordmark && <AmassWordmark className="h-4" onDark={onDark} />}
    </div>
  );
}
