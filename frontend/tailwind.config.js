/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Cabinet Grotesk"', '"Satoshi"', 'sans-serif'],
        sans: ['"Geist"', '"Satoshi"', 'Inter', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Brand tokens (driven by CSS variables so dark mode swaps cleanly)
        brand: {
          emerald: 'var(--amass-primary)',
          emeraldHover: 'var(--amass-primary-hover)',
          charcoal: '#111111',
          gold: 'var(--amass-accent)',
          grey: '#F7F8FA',
        },
        marker: {
          available: 'var(--m-available)',
          coming: 'var(--m-coming)',
          verified: 'var(--m-verified)',
          premium: 'var(--m-premium)',
          sold: 'var(--m-sold)',
        },
        surface: 'var(--amass-surface)',
        ink: 'var(--amass-text)',
        subtle: 'var(--amass-text-secondary)',
        hairline: 'var(--amass-border)',
        borderRadius: {
          lg: 'var(--radius)',
          md: 'calc(var(--radius) - 2px)',
          sm: 'calc(var(--radius) - 4px)'
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 8px 32px rgba(17,17,17,0.06)',
        floating: '0 20px 60px -12px rgba(17,17,17,0.18)',
        glow: '0 0 40px rgba(15,139,76,0.28)',
        gold: '0 0 32px rgba(212,175,55,0.30)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'marker-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.12)', opacity: '1' },
        },
        'ping-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.6' },
          '80%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        'marquee': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'shine': {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'marker-pulse': 'marker-pulse 2.4s ease-in-out infinite',
        'ping-ring': 'ping-ring 2.4s cubic-bezier(0,0,0.2,1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'marquee': 'marquee 40s linear infinite',
      },
    }
  },
  plugins: [require("tailwindcss-animate")],
};
