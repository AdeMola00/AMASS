/**
 * Brand portal API — a separate, brand-only login (token typ=brand) that never mixes with the app session.
 * Token lives under its own storage key; a 401 clears it so the Brand screens fall back to the sign-in form.
 */
import { storage } from "@/src/utils/storage";
import { ApiError } from "@/src/lib/api";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const KEY = "amass_brand_token";

export type BrandCategory = { key: string; label: string; icon: string; color: string };
export type BrandProfile = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  logo_url?: string | null;
  accent?: string;
  tagline?: string | null;
  categories: string[];
  website?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  product_count: number;
  in_stock_count: number;
  published?: boolean;
  verification_status?: string;
};
export type BrandAccountMe = { id: string; name?: string | null; email: string; brand_id: string; password_set?: boolean };
export type BrandMe = { account: BrandAccountMe; brand: BrandProfile; categories: BrandCategory[] };
export type BrandInvite = { email: string; name?: string | null; brand_name?: string | null; brand_logo_url?: string | null; kind: "invite" | "reset"; expires_at?: string };
export type BrandProduct = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  category_name: string;
  price: number;
  images: string[];
  stock_status?: string | null;
  published: boolean;
  featured: boolean;
  promo?: { label?: string; previous_price?: number } | null;
  views: number;
  saves: number;
  basket_adds: number;
  updated_at?: string;
};
export type BrandProductInput = {
  name: string;
  description?: string;
  category: string;
  price: number;
  images?: string[];
  stock_status?: "in_stock" | "out_of_stock" | "preorder";
  published?: boolean;
  promo_previous_price?: number | null;
  promo_label?: string | null;
  clear_promo?: boolean;
};

export const brandToken = {
  get: () => storage.getItem<string | null>(KEY, null),
  set: (t: string | null) => (t ? storage.setItem(KEY, t) : storage.removeItem(KEY)),
};

async function breq<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await brandToken.get();
  const res = await fetch(`${BASE}/api/brand${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers as Record<string, string> | undefined) } });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let detail: any;
    try {
      const j = await res.json();
      detail = j.detail;
      msg = typeof j.detail === "string" ? j.detail : msg;
    } catch {}
    if (res.status === 401 && token && !path.startsWith("/auth/login")) await brandToken.set(null);
    throw new ApiError(msg, res.status, detail);
  }
  return res.json();
}

export const brandApi = {
  login: async (email: string, password: string) => {
    const r = await breq<BrandMe & { token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    await brandToken.set(r.token);
    return r;
  },
  logout: () => brandToken.set(null),
  forgotPassword: (email: string) => breq<{ ok: boolean; message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  invite: (token: string) => breq<BrandInvite>(`/auth/invite/${encodeURIComponent(token)}`),
  setPassword: async (token: string, password: string) => {
    const r = await breq<BrandMe & { token: string }>("/auth/set-password", { method: "POST", body: JSON.stringify({ token, password }) });
    await brandToken.set(r.token);
    return r;
  },
  me: () => breq<BrandMe>("/me"),
  changePassword: (current_password: string, new_password: string) => breq<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  updateProfile: (patch: Partial<Pick<BrandProfile, "tagline" | "logo_url" | "website" | "phone" | "whatsapp" | "email" | "accent">>) => breq<BrandMe>("/profile", { method: "PATCH", body: JSON.stringify(patch) }),
  products: () => breq<{ items: BrandProduct[]; count: number }>("/products"),
  createProduct: (body: BrandProductInput) => breq<BrandProduct>("/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id: string, body: Partial<BrandProductInput>) => breq<BrandProduct>(`/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  removeProduct: (id: string) => breq<{ ok: boolean }>(`/products/${encodeURIComponent(id)}`, { method: "DELETE" }),
  upload: (data_url: string) => breq<{ url: string; path: string }>("/upload", { method: "POST", body: JSON.stringify({ data_url }) }),
};
