/**
 * My Home artwork — photo-real squares generated with backend/scripts/gen_home_art.py (Nano Banana).
 * One image per appliance category and per dashboard section, plus a default home hero.
 */
import type { ItemCategory } from "@/src/lib/homeHub";

export const HOME_HERO = require("../../../assets/images/home/hero-home.webp");

export const CATEGORY_ART: Record<ItemCategory, number> = {
  tv: require("../../../assets/images/home/cat-tv.webp"),
  fridge: require("../../../assets/images/home/cat-fridge.webp"),
  washer: require("../../../assets/images/home/cat-washer.webp"),
  ac: require("../../../assets/images/home/cat-ac.webp"),
  generator: require("../../../assets/images/home/cat-generator.webp"),
  inverter: require("../../../assets/images/home/cat-inverter.webp"),
  laptop: require("../../../assets/images/home/cat-laptop.webp"),
  phone: require("../../../assets/images/home/cat-phone.webp"),
  kitchen: require("../../../assets/images/home/cat-kitchen.webp"),
  furniture: require("../../../assets/images/home/cat-furniture.webp"),
  other: require("../../../assets/images/home/cat-other.webp"),
};

export const SECTION_ART = {
  appliances: require("../../../assets/images/home/sec-appliances.webp"),
  records: require("../../../assets/images/home/sec-records.webp"),
  reminders: require("../../../assets/images/home/sec-reminders.webp"),
  spending: require("../../../assets/images/home/sec-spending.webp"),
  services: require("../../../assets/images/home/sec-services.webp"),
  protect: require("../../../assets/images/home/sec-protect.webp"),
  bills: require("../../../assets/images/home/sec-bills.webp"),
} as const;

export const ITEM_CATEGORIES: { key: ItemCategory; label: string; short: string; insurable: boolean }[] = [
  { key: "tv", label: "TV & audio", short: "TV", insurable: true },
  { key: "fridge", label: "Fridge & freezer", short: "Fridge", insurable: true },
  { key: "washer", label: "Washing machine", short: "Washer", insurable: true },
  { key: "ac", label: "Air conditioner", short: "AC", insurable: true },
  { key: "generator", label: "Generator", short: "Generator", insurable: true },
  { key: "inverter", label: "Inverter & solar", short: "Inverter", insurable: true },
  { key: "laptop", label: "Laptop & computer", short: "Laptop", insurable: true },
  { key: "phone", label: "Phone & tablet", short: "Phone", insurable: true },
  { key: "kitchen", label: "Kitchen appliance", short: "Kitchen", insurable: true },
  { key: "furniture", label: "Furniture", short: "Furniture", insurable: true },
  { key: "other", label: "Other", short: "Other", insurable: false },
];

export const categoryLabel = (k?: string | null) => ITEM_CATEGORIES.find((c) => c.key === k)?.label ?? "Other";
export const categoryArt = (k?: string | null) => CATEGORY_ART[(k as ItemCategory) ?? "other"] ?? CATEGORY_ART.other;

export const OWNERSHIP: { key: "owner" | "renting" | "family" | "other"; label: string }[] = [
  { key: "owner", label: "I own it" },
  { key: "renting", label: "Renting" },
  { key: "family", label: "Family home" },
  { key: "other", label: "Other" },
];
