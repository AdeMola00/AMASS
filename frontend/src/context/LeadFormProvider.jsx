import React, { createContext, useContext, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { submitLead } from "@/lib/api";

const FORM_CONFIG = {
  become_agent: {
    title: "Become an AMASS Agent",
    subtitle: "Join thousands of verified agents growing with AMASS.",
    fields: ["name", "email", "phone", "company", "message"],
    selects: [{ key: "experience", label: "Experience", options: ["0-1 years", "2-4 years", "5-9 years", "10+ years"] }],
    cta: "Apply to Join",
  },
  list_property: {
    title: "List Your Property",
    subtitle: "Reach millions of verified buyers and renters.",
    fields: ["name", "email", "phone", "location", "message"],
    selects: [{ key: "property_type", label: "Property Type", options: ["Apartment", "Duplex", "Land", "Commercial", "Short Let", "Luxury Home"] }],
    cta: "Submit Listing",
  },
  contact: {
    title: "Contact Us",
    subtitle: "We usually respond within one business day.",
    fields: ["name", "email", "phone", "message"],
    selects: [],
    cta: "Send Message",
  },
  book_demo: {
    title: "Book a Demo",
    subtitle: "See AMASS intelligence in action, tailored to you.",
    fields: ["name", "email", "phone", "company"],
    selects: [{ key: "team_size", label: "Team Size", options: ["Just me", "2-10", "11-50", "50+"] }],
    cta: "Request Demo",
  },
  partner: {
    title: "Partner With AMASS",
    subtitle: "Build the future of African PropTech with us.",
    fields: ["name", "email", "company", "message"],
    selects: [{ key: "partner_type", label: "Partnership Type", options: ["Financial", "Developer", "Technology", "Media", "Government"] }],
    cta: "Start Conversation",
  },
  waiting_list: {
    title: "Join the Waiting List",
    subtitle: "Be first to access new cities and features.",
    fields: ["name", "email"],
    selects: [{ key: "city", label: "City of Interest", options: ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Accra", "Nairobi", "Other"] }],
    cta: "Reserve My Spot",
  },
};

const LeadFormContext = createContext({ openForm: () => {} });
export const useLeadForm = () => useContext(LeadFormContext);

const EASE = [0.16, 1, 0.3, 1];
const FIELD_META = {
  name: { label: "Full Name", type: "text", placeholder: "Ada Obi", required: true },
  email: { label: "Email", type: "email", placeholder: "you@email.com", required: true },
  phone: { label: "Phone", type: "tel", placeholder: "+234 800 000 0000" },
  company: { label: "Company", type: "text", placeholder: "Company / Agency" },
  location: { label: "Location", type: "text", placeholder: "Lekki, Lagos" },
  message: { label: "Message", type: "textarea", placeholder: "Tell us a little more…" },
};

export function LeadFormProvider({ children }) {
  const [formType, setFormType] = useState(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [selectVals, setSelectVals] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const config = formType ? FORM_CONFIG[formType] : null;

  const openForm = (type) => {
    setFormType(type);
    setValues({});
    setSelectVals({});
    setDone(false);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!values.email) {
      toast.error("Please enter your email.");
      return;
    }
    setSubmitting(true);
    try {
      const details = { ...selectVals };
      ["phone", "company", "location"].forEach((k) => {
        if (values[k]) details[k] = values[k];
      });
      await submitLead({
        form_type: formType,
        name: values.name || null,
        email: values.email,
        phone: values.phone || null,
        message: values.message || null,
        details,
      });
      setDone(true);
      toast.success("Received! Our team will be in touch shortly.");
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LeadFormContext.Provider value={{ openForm }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg border-hairline bg-background p-0 overflow-hidden rounded-4xl"
          data-testid="lead-form-dialog"
        >
          {config && (
            <div className="relative">
              <button
                onClick={close}
                data-testid="lead-form-close"
                className="absolute right-5 top-5 z-10 grid h-9 w-9 place-items-center rounded-full bg-surface text-ink transition-colors hover:bg-brand-emerald hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <AnimatePresence mode="wait">
                {done ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="flex flex-col items-center justify-center px-8 py-16 text-center"
                    data-testid="lead-form-success"
                  >
                    <div className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-brand-emerald/12 text-brand-emerald">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h3 className="font-display text-2xl font-bold text-ink">You're all set</h3>
                    <p className="mt-3 max-w-xs text-sm text-subtle">
                      Thank you — the AMASS team has received your details and will reach out soon.
                    </p>
                    <button
                      onClick={close}
                      className="mt-8 rounded-full bg-brand-charcoal px-8 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.03] dark:bg-white dark:text-black"
                    >
                      Done
                    </button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    onSubmit={handleSubmit}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="px-8 py-10"
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-emerald">AMASS</p>
                    <h3 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">{config.title}</h3>
                    <p className="mt-2 text-sm text-subtle">{config.subtitle}</p>

                    <div className="mt-7 space-y-4">
                      {config.fields.map((f) => {
                        const meta = FIELD_META[f];
                        return (
                          <div key={f} className="space-y-1.5">
                            <Label htmlFor={`lead-${f}`} className="text-xs font-medium text-subtle">
                              {meta.label}{meta.required && " *"}
                            </Label>
                            {meta.type === "textarea" ? (
                              <Textarea
                                id={`lead-${f}`}
                                data-testid={`lead-field-${f}`}
                                placeholder={meta.placeholder}
                                rows={3}
                                value={values[f] || ""}
                                onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                                className="rounded-2xl border-hairline bg-surface focus-visible:ring-2 focus-visible:ring-brand-emerald"
                              />
                            ) : (
                              <Input
                                id={`lead-${f}`}
                                data-testid={`lead-field-${f}`}
                                type={meta.type}
                                required={meta.required}
                                placeholder={meta.placeholder}
                                value={values[f] || ""}
                                onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                                className="h-11 rounded-2xl border-hairline bg-surface focus-visible:ring-2 focus-visible:ring-brand-emerald"
                              />
                            )}
                          </div>
                        );
                      })}

                      {config.selects.map((s) => (
                        <div key={s.key} className="space-y-1.5">
                          <Label className="text-xs font-medium text-subtle">{s.label}</Label>
                          <Select
                            value={selectVals[s.key] || ""}
                            onValueChange={(val) => setSelectVals((v) => ({ ...v, [s.key]: val }))}
                          >
                            <SelectTrigger
                              data-testid={`lead-select-${s.key}`}
                              className="h-11 rounded-2xl border-hairline bg-surface focus:ring-2 focus:ring-brand-emerald"
                            >
                              <SelectValue placeholder={`Select ${s.label.toLowerCase()}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {s.options.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      data-testid="lead-form-submit"
                      className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-brand-emerald py-4 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-60"
                    >
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {config.cta}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </LeadFormContext.Provider>
  );
}
