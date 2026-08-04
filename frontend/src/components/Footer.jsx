import React from "react";
import { Link } from "react-router-dom";
import { AmassLogo } from "@/components/AmassLogo";

export function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white mt-24" data-testid="site-footer">
      <div className="mx-auto max-w-7xl px-6 py-16 grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2">
          <AmassLogo />
          <p className="mt-4 text-sm text-neutral-600 max-w-sm leading-relaxed">
            Africa's Property Operating System. Discover, verify, transact and
            improve property with one trusted network.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { to: "/properties", label: "Property search" },
            { to: "/marketplace", label: "Marketplace" },
            { to: "/discover", label: "Neighborhoods" },
          ]}
        />
        <FooterCol
          title="Business"
          links={[
            { to: "/agents", label: "For agents" },
            { to: "/register", label: "List a property" },
            { to: "/about", label: "About" },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { to: "#", label: "Terms" },
            { to: "#", label: "Privacy" },
            { to: "#", label: "Contact" },
          ]}
        />
      </div>
      <div className="border-t border-neutral-100">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col md:flex-row items-center justify-between text-xs text-neutral-500 gap-3">
          <div>© {new Date().getFullYear()} AMASS Africa. All rights reserved.</div>
          <div>Made with care in Lagos · Abuja · Nairobi · Accra</div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
        {title}
      </h4>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              to={l.to}
              className="text-sm text-neutral-700 hover:text-[color:var(--amass-red)] transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
