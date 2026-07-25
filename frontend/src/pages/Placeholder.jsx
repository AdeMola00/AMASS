import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { findNavItem } from "@/config/nav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Construction, ArrowRight } from "lucide-react";

const DESCRIPTIONS = {
  properties: "Browse, approve and manage every property listing across the AMASS marketplace.",
  property_verification: "Review verification submissions, documents and KYC for listed properties.",
  agents: "Onboard, verify and manage AMASS agents and their performance.",
  users: "View and manage registered platform users and their accounts.",
  property_owners: "Manage property owner profiles, portfolios and payouts.",
  developers: "Manage real estate developers and their project pipelines.",
  transactions: "Track every transaction flowing through the AMASS platform.",
  payments: "Reconcile payments, refunds and payout schedules.",
  subscriptions: "Manage recurring subscription plans and billing.",
  construction_marketplace: "Manage vendors, materials and services in the construction marketplace.",
  home_marketplace: "Manage furniture, appliances and home essentials listings.",
  messages: "Centralized inbox for platform conversations and support threads.",
  notifications: "Configure and broadcast platform-wide notifications.",
  analytics: "Deep-dive analytics across leads, listings, revenue and growth.",
  reports: "Generate and export operational and financial reports.",
  ai_management: "Configure AI models, pricing intelligence and automated valuations.",
};

export default function Placeholder() {
  const location = useLocation();
  const item = findNavItem(location.pathname);
  const Icon = item?.icon || Construction;
  const key = item?.module;

  return (
    <div className="space-y-6" data-testid={`placeholder-${key}`}>
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">{item?.label}</h1>
        <p className="text-muted-foreground text-sm mt-1">{DESCRIPTIONS[key] || "This module is part of the AMASS platform roadmap."}</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-10 sm:p-16 flex flex-col items-center text-center border-dashed">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
            <Icon className="h-8 w-8" />
          </div>
          <Badge variant="outline" className="mb-3 gap-1 border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))]">
            Coming Soon
          </Badge>
          <h2 className="font-heading text-xl font-bold tracking-tight max-w-md">
            {item?.label} module is structured and ready for development
          </h2>
          <p className="text-muted-foreground text-sm mt-2 max-w-md">
            The data models, navigation and access controls are already wired into the AMASS operating system.
            Full functionality will be built here as the platform scales.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-full border border-border px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Model ready
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-full border border-border px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> RBAC enforced
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-full border border-border px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]" /> UI pending
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
