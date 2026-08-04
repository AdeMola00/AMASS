import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Building2, ShieldCheck, Users, Layers } from "lucide-react";

export function About() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20" data-testid="about-page">
      <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-3">
        About AMASS
      </div>
      <h1 className="font-display text-5xl md:text-7xl leading-none">
        Africa deserves a property platform that <span className="italic">works</span>.
      </h1>
      <p className="mt-6 text-lg text-neutral-600 leading-relaxed">
        AMASS is a unified property operating system — Landing web, mobile
        marketplace, and admin console — all backed by a single API and a
        single database. Search verified listings, unlock premium intel with
        MASS tokens, and reward vetted service pros in FIX. From land in
        Abeokuta to a serviced apartment in Kilimani, we're bringing African
        real estate into one coherent, trusted network.
      </p>

      <div className="mt-14 grid md:grid-cols-2 gap-6">
        <Card icon={<Building2 />} title="Unified ecosystem"
          body="One backend, one database, one auth. Whether a customer signs up on the landing page, the app, or is invited by an agent, they carry the same account and wallet across every surface." />
        <Card icon={<ShieldCheck />} title="Title-first trust"
          body="We separate 'listed by AMASS', 'mandated', 'owner-listed' and 'independent' listings so buyers know exactly whose skin is in the game." />
        <Card icon={<Users />} title="Certified agents"
          body="Three-tier agent verification (Registered → Identity → Mandated) with public agent pages, ratings and mandate rates." />
        <Card icon={<Layers />} title="More than search"
          body="Marketplace + FIXA services + property improvement + BNPL financing — everything you need after the sale." />
      </div>

      <div className="mt-16 pt-10 border-t border-neutral-100 flex flex-wrap gap-3">
        <Link to="/register"><Button className="amass-btn-red rounded-full px-6 h-11">Create your account</Button></Link>
        <Link to="/properties"><Button variant="outline" className="rounded-full px-6 h-11">Browse listings</Button></Link>
      </div>
    </div>
  );
}

function Card({ icon, title, body }) {
  return (
    <div className="p-6 rounded-2xl border border-neutral-200 bg-white">
      <div className="w-10 h-10 rounded-full bg-red-50 text-[color:var(--amass-red)] flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{body}</p>
    </div>
  );
}
