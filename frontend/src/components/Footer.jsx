import React, { useState } from "react";
import { ArrowRight, Twitter, Instagram, Linkedin, Facebook, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FOOTER_LINKS } from "@/data/content";
import { subscribeNewsletter } from "@/lib/api";
import { useLeadForm } from "@/context/LeadFormProvider";
import { scrollToSection } from "@/context/SmoothScroll";
import Logo from "@/components/Logo";

const SOCIAL = [Twitter, Instagram, Linkedin, Facebook];

export default function Footer() {
  const { openForm } = useLeadForm();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const subscribe = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await subscribeNewsletter(email);
      toast.success("Subscribed! Welcome to AMASS.");
      setEmail("");
    } catch {
      toast.error("Could not subscribe. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="relative bg-brand-charcoal pt-20 text-white" data-testid="footer">
      <div className="absolute inset-x-0 top-0 flex h-1.5">
        <span className="flex-1 bg-[#0F8B4C]" />
        <span className="flex-1 bg-brand-gold" />
        <span className="flex-1 bg-[#E11D2A]" />
      </div>
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <button onClick={() => scrollToSection("#top")} className="flex items-center">
              <Logo height={30} chip />
            </button>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/60">
              Africa's intelligent property discovery, real estate, construction and home
              marketplace — powered by AI and verified data.
            </p>

            <form onSubmit={subscribe} className="mt-8 max-w-sm" data-testid="newsletter-form">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Newsletter</label>
              <div className="mt-3 flex items-center gap-2 rounded-full border border-white/15 bg-white/5 p-1.5 pl-5">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  data-testid="newsletter-email"
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                />
                <button
                  type="submit"
                  disabled={loading}
                  data-testid="newsletter-submit"
                  className="grid h-10 w-10 place-items-center rounded-full bg-brand-emerald text-white transition-transform hover:scale-105 disabled:opacity-60"
                  aria-label="Subscribe"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {Object.entries(FOOTER_LINKS).map(([group, links]) => (
              <div key={group}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{group}</p>
                <ul className="mt-4 space-y-3">
                  {links.map((l) => (
                    <li key={l}>
                      <button
                        onClick={() => openForm("contact")}
                        className="text-sm text-white/70 transition-colors hover:text-brand-gold"
                        data-testid={`footer-link-${l.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        {l}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-white/10 py-8 md:flex-row">
          <p className="text-sm text-white/50">© {new Date().getFullYear()} AMASS. All rights reserved.</p>
          <div className="flex gap-3">
            {SOCIAL.map((Icon, i) => (
              <a
                key={i}
                href="#top"
                onClick={(e) => { e.preventDefault(); scrollToSection("#top"); }}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-brand-emerald hover:text-brand-emerald"
                aria-label="Social link"
                data-testid={`social-${i}`}
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
