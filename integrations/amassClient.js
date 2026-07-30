/**
 * AMASS shared API client — drop this file into the Mobile App and Landing Page projects.
 * All content, listings, marketplace, config, tokens and announcements come from the
 * single AMASS backend, so any change in the Admin Portal shows up live for real users.
 *
 * Usage:
 *   import { amass } from "./amassClient";
 *   const boot = await amass.bootstrap();          // everything the homepage needs, one call
 *   const props = await amass.properties({ city: "Lagos", listing: "Sale" });
 *   await amass.submitLead({ type: "agent", name, email, phone, message });
 *
 * Set AMASS_API_BASE to the admin backend origin, e.g.
 *   https://amass-control.preview.emergentagent.com
 */
const AMASS_API_BASE =
  (typeof process !== "undefined" && process.env && (process.env.AMASS_API_BASE || process.env.REACT_APP_AMASS_API_BASE || process.env.EXPO_PUBLIC_AMASS_API_BASE)) ||
  "https://amass-control.preview.emergentagent.com";

const API = `${AMASS_API_BASE}/api`;

async function get(path, params) {
  const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString() : "";
  const res = await fetch(`${API}${path}${qs}`);
  if (!res.ok) throw new Error(`AMASS ${path} -> ${res.status}`);
  return res.json();
}
async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AMASS ${path} -> ${res.status}`);
  return res.json();
}

export const mediaUrl = (u) => (!u ? "" : u.startsWith("http") ? u : `${AMASS_API_BASE}${u}`);

export const amass = {
  base: AMASS_API_BASE,
  // one-shot payload for a homepage / app launch
  bootstrap: () => get("/public/bootstrap"),
  // landing page CMS content ({ hero, pillars, showcase, ... })
  landing: () => get("/public/landing"),
  // mobile app configuration ({ homepage_sections, map_settings, app_banners, ... })
  appConfig: () => get("/public/app-config"),
  // property marketplace (approved only)
  properties: (filters) => get("/public/properties", filters),
  property: (id) => get(`/public/properties/${id}`),
  submitProperty: (payload) => post("/public/properties", payload),
  agents: (city) => get("/public/agents", city ? { city } : undefined),
  // home marketplace
  categories: () => get("/public/marketplace/categories"),
  products: (filters) => get("/public/marketplace/products", filters),
  // token economy catalog
  tokenBundles: () => get("/public/tokens/bundles"),
  plans: () => get("/public/tokens/plans"),
  // in-app announcements pushed from the Admin Portal
  announcements: () => get("/public/announcements"),
  // capture any website/app form (Become an Agent, Contact, Book Demo, Newsletter, Waiting List...)
  submitLead: (payload) => post("/public/leads", payload),
};

export default amass;
