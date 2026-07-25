import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, Menu, X } from "lucide-react";
import { useTheme } from "@/context/ThemeProvider";
import { useLeadForm } from "@/context/LeadFormProvider";
import { scrollToSection } from "@/context/SmoothScroll";
import Logo from "@/components/Logo";

const NAV = [
  { label: "Explore", target: "#showcase" },
  { label: "What We Do", target: "#pillars" },
  { label: "Agents", target: "#agents" },
  { label: "How It Works", target: "#how" },
  { label: "FAQ", target: "#faq" },
];

export default function Navbar() {
  const { theme, toggle } = useTheme();
  const { openForm } = useLeadForm();
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (t) => { scrollToSection(t); setMobile(false); };

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="fixed inset-x-0 top-0 z-50 px-4 pt-4"
    >
      <nav
        data-testid="navbar"
        className={`mx-auto flex max-w-[1400px] items-center justify-between rounded-full px-5 py-3 transition-all duration-500 ${
          scrolled ? "glass-light border border-hairline shadow-soft" : "border border-transparent"
        }`}
      >
        <button onClick={() => go("#top")} className="flex items-center" data-testid="logo">
          <Logo height={26} chip={!scrolled || theme === "dark"} />
        </button>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <button
              key={n.label}
              onClick={() => go(n.target)}
              data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              className="rounded-full px-4 py-2 text-sm font-medium text-subtle transition-colors hover:bg-surface hover:text-ink"
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            data-testid="theme-toggle"
            aria-label="Toggle theme"
            className="grid h-10 w-10 place-items-center rounded-full border border-hairline text-ink transition-colors hover:bg-surface"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </button>

          <button
            onClick={() => openForm("become_agent")}
            data-testid="nav-become-agent"
            className="hidden rounded-full bg-brand-charcoal px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.04] dark:bg-white dark:text-black md:block"
          >
            Become an Agent
          </button>

          <button
            onClick={() => setMobile((m) => !m)}
            className="grid h-10 w-10 place-items-center rounded-full border border-hairline text-ink lg:hidden"
            data-testid="mobile-menu-toggle"
            aria-label="Menu"
          >
            {mobile ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobile && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-auto mt-2 max-w-[1400px] overflow-hidden rounded-3xl glass-light border border-hairline p-3 shadow-floating lg:hidden"
          >
            {NAV.map((n) => (
              <button
                key={n.label}
                onClick={() => go(n.target)}
                className="block w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-ink hover:bg-surface"
              >
                {n.label}
              </button>
            ))}
            <button
              onClick={() => { openForm("become_agent"); setMobile(false); }}
              className="mt-2 w-full rounded-full bg-brand-emerald py-3 text-sm font-semibold text-white"
            >
              Become an Agent
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
