import React, { useState } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Home, Wallet, BedDouble } from "lucide-react";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLeadForm } from "@/context/LeadFormProvider";

const FIELDS = [
  { key: "location", label: "Location", icon: MapPin, placeholder: "Lagos, Abuja, Lekki…", type: "input" },
  { key: "type", label: "Property Type", icon: Home, type: "select", options: ["Apartment", "Duplex", "Land", "Commercial", "Short Let", "Luxury Home"] },
  { key: "budget", label: "Budget", icon: Wallet, type: "select", options: ["Under ₦50M", "₦50M – ₦150M", "₦150M – ₦400M", "₦400M+"] },
  { key: "beds", label: "Bedrooms", icon: BedDouble, type: "select", options: ["1", "2", "3", "4", "5+"] },
];

export default function SearchBar() {
  const [values, setValues] = useState({});
  const { openForm } = useLeadForm();

  const search = () => {
    toast("The full search lives in the AMASS app", {
      description: "Get early access and we'll notify you the moment it launches.",
    });
    openForm("waiting_list");
  };

  return (
    <div className="relative z-40 mx-auto -mt-10 w-full max-w-[1100px] px-4 sm:-mt-16 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-stretch gap-2 rounded-4xl glass-light border border-hairline p-3 shadow-floating md:flex-row md:items-center md:rounded-full md:p-2.5"
        data-testid="search-bar"
      >
        {FIELDS.map((f, i) => {
          const Icon = f.icon;
          return (
            <React.Fragment key={f.key}>
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-3xl px-4 py-2.5 transition-colors hover:bg-surface md:rounded-full">
                <Icon className="h-4 w-4 shrink-0 text-brand-emerald" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{f.label}</p>
                  {f.type === "input" ? (
                    <input
                      data-testid="search-location"
                      placeholder={f.placeholder}
                      value={values[f.key] || ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full bg-transparent text-sm font-medium text-ink outline-none placeholder:text-subtle/60"
                    />
                  ) : (
                    <Select value={values[f.key] || ""} onValueChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))}>
                      <SelectTrigger
                        data-testid={`search-${f.key}`}
                        className="h-auto border-0 bg-transparent p-0 text-sm font-medium text-ink shadow-none focus:ring-0 [&>svg]:opacity-50"
                      >
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              {i < FIELDS.length - 1 && <span className="mx-1 hidden h-8 w-px bg-hairline md:block" />}
            </React.Fragment>
          );
        })}

        <button
          onClick={search}
          data-testid="search-submit"
          className="flex items-center justify-center gap-2 rounded-full bg-brand-emerald px-8 py-4 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.03] md:py-4"
        >
          <Search className="h-4 w-4" /> Search
        </button>
      </motion.div>
      <p className="mt-4 text-center text-xs font-medium tracking-wide text-subtle" data-testid="search-caption">
        A preview of the AMASS app experience — the full intelligent search lives in the app.
      </p>
    </div>
  );
}
