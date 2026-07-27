import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const AUTH_KEY = "amass_auth_token";

export type Property = {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  listing_type: "buy" | "rent" | "lease" | "shortlet";
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  size_sqm: number;
  location: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  images: string[];
  amenities: string[];
  status: "available" | "coming_soon" | "verified" | "premium" | "sold";
  verified: boolean;
  agent_name?: string;
  agent_avatar?: string;
  year_built?: number;
  parking?: number;
  investment_score?: number;
  ai_valuation?: number;
};

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  is_agent: boolean;
  created_at: string;
};

export type MarketplaceItem = {
  id: string;
  category: "construction" | "home" | "services";
  subcategory: string;
  name: string;
  description: string;
  price: number;
  image: string;
  vendor: string;
  rating: number;
  reviews: number;
};

export type Neighborhood = {
  id: string;
  name: string;
  city: string;
  state: string;
  image: string;
  avg_price: number;
  price_change_pct: number;
  walk_score: number;
  school_score: number;
  safety_score: number;
  infrastructure_score: number;
  overall_score: number;
  latitude: number;
  longitude: number;
  trending: boolean;
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(AUTH_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
    ...(await authHeaders()),
  };
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; full_name: string; phone?: string }) =>
    req<{ access_token: string; user: UserProfile }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    req<{ access_token: string; user: UserProfile }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  me: () => req<UserProfile>("/auth/me"),

  // Properties
  listProperties: (params?: Record<string, string | number | boolean | undefined>) => {
    const qs = params
      ? "?" +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "" && v !== null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return req<Property[]>(`/properties${qs}`);
  },
  getProperty: (id: string) => req<Property>(`/properties/${id}`),

  // Favorites
  toggleFavorite: (property_id: string) =>
    req<{ favorited: boolean }>(`/favorites/toggle`, {
      method: "POST",
      body: JSON.stringify({ property_id }),
    }),
  favoriteIds: () => req<{ ids: string[] }>("/favorites/ids"),
  listFavorites: () => req<Property[]>("/favorites"),

  // Marketplace
  marketplace: (category?: string) =>
    req<MarketplaceItem[]>(`/marketplace${category ? `?category=${category}` : ""}`),

  // Neighborhoods
  neighborhoods: () => req<Neighborhood[]>("/neighborhoods"),

  // Agent
  createProperty: (data: {
    title: string;
    description: string;
    price: number;
    listing_type: string;
    property_type: string;
    bedrooms: number;
    bathrooms: number;
    size_sqm: number;
    location: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
    images: string[];
    amenities: string[];
    year_built?: number;
    parking?: number;
  }) =>
    req<Property>("/properties", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  agentDashboard: () =>
    req<{
      stats: {
        listings: number;
        active: number;
        verified: number;
        views_30d: number;
        leads_30d: number;
        appointments_30d: number;
        total_value: number;
      };
      recent: Property[];
    }>("/agent/dashboard"),
  agentListings: () => req<Property[]>("/agent/listings"),
  agentLeads: () =>
    req<
      {
        id: string;
        name: string;
        avatar: string;
        channel: "chat" | "call" | "email";
        message: string;
        property_id: string;
        property_title: string;
        property_image: string;
        created_at: string;
        unread: boolean;
      }[]
    >("/agent/leads"),

  // AI
  aiSearchSync: (query: string, session_id?: string) =>
    req<{ reply: string }>("/ai/search/sync", {
      method: "POST",
      body: JSON.stringify({ query, session_id }),
    }),
};

export const AUTH_STORAGE_KEY = AUTH_KEY;
