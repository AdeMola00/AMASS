/** Formatting + link helpers shared by the Shop screens. Keeps every claim traceable (source + date). */
import { Linking, Platform, Share } from "react-native";
import * as WebBrowser from "expo-web-browser";
import type { ShopPrice, ShopProduct, ShopPurchaseRoute } from "@/src/lib/api";

export const ORIGIN = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

/** Logo/product URLs may be backend-relative (`/api/shop/assets/...`). */
export function absUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  return u.startsWith("/") ? `${ORIGIN}${u}` : u;
}

/** Full naira amount — shopping needs exact figures, never the map's ₦1.2M shorthand. */
export function naira(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

export function priceLabel(p: ShopPrice): { main: string; prefix?: string; sub?: string } {
  if (p.kind === "on_request" || p.amount === null) return { main: "Price on request", sub: p.note ?? "Ask the store" };
  if (p.kind === "from") return { prefix: "From", main: naira(p.amount), sub: p.rrp ? `Rec. retail ${naira(p.rrp)}` : undefined };
  return { main: naira(p.amount) };
}

export function discountPct(product: ShopProduct): number | null {
  const prev = product.promo?.previous_price;
  const cur = product.price.amount;
  if (!prev || !cur || prev <= cur) return null;
  return Math.round(((prev - cur) / prev) * 100);
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function stockLabel(s: ShopProduct["stock"]): { label: string; tone: "success" | "error" | "neutral" } {
  if (s.status === "in_stock") return { label: "In stock", tone: "success" };
  if (s.status === "out_of_stock") return { label: "Out of stock", tone: "error" };
  return { label: "Stock: confirm with store", tone: "neutral" };
}

export async function openRoute(route: ShopPurchaseRoute): Promise<void> {
  if (route.kind === "website") {
    if (Platform.OS === "web") {
      window.open(route.url, "_blank", "noopener");
      return;
    }
    await WebBrowser.openBrowserAsync(route.url);
    return;
  }
  await Linking.openURL(route.url);
}

export async function shareLink(title: string, url: string): Promise<void> {
  try {
    await Share.share(Platform.OS === "ios" ? { message: title, url } : { message: `${title}\n${url}` });
  } catch {
    /* user dismissed */
  }
}

/** White text on dark accents; darken light accents so the header stays legible. */
export function accentColors(hex: string): { bg: string; fg: string; soft: string } {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const dark = (c: number) => Math.max(0, Math.round(c * 0.62));
  const bg = lum > 0.55 ? `#${[dark(r), dark(g), dark(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}` : hex;
  return { bg, fg: "#FFFFFF", soft: `rgba(${r},${g},${b},0.12)` };
}

export const CATEGORY_FALLBACK_ICON: Record<string, string> = {
  furniture: "bed", electronics: "tv", appliances: "snow", home_decor: "color-palette", kitchen: "restaurant", lighting: "bulb",
};
