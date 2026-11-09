import { TKey } from "@/src/i18n";
import type { Role } from "@/src/auth";

export const ROLE_META: Record<Role, { label: TKey; icon: any }> = {
  agent: { label: "role_agent", icon: "home" },
  seller: { label: "role_seller", icon: "pricetag" },
  fixa: { label: "role_fixa", icon: "construct" },
  brand: { label: "role_brand", icon: "storefront" },
};

export const CITIES = [
  { name: "Lagos", state: "Lagos", lat: 6.5244, lng: 3.3792 },
  { name: "Abuja", state: "FCT", lat: 9.0765, lng: 7.3986 },
  { name: "Port Harcourt", state: "Rivers", lat: 4.8156, lng: 7.0498 },
  { name: "Ibadan", state: "Oyo", lat: 7.3775, lng: 3.947 },
  { name: "Kano", state: "Kano", lat: 12.0022, lng: 8.592 },
  { name: "Enugu", state: "Enugu", lat: 6.4584, lng: 7.5464 },
  { name: "Benin City", state: "Edo", lat: 6.335, lng: 5.6037 },
  { name: "Kaduna", state: "Kaduna", lat: 10.5105, lng: 7.4165 },
];
