// AMASS unified API client — talks to the single production backend.
// All Landing, Public browse, User dashboard AND Admin Portal use this.
const BASE = process.env.REACT_APP_BACKEND_URL;
const AUTH_KEY = "amass_auth_token";

export function getToken() {
  return localStorage.getItem(AUTH_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(AUTH_KEY, t);
  else localStorage.removeItem(AUTH_KEY);
}

async function req(path, opts = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function qs(params) {
  if (!params) return "";
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return s ? `?${s}` : "";
}

export const api = {
  // Auth
  register: (data) =>
    req("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data) =>
    req("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => req("/auth/me"),

  // Properties (public)
  listProperties: (params) => req(`/properties${qs(params)}`),
  getProperty: (id) => req(`/properties/${id}`),
  recordView: (id) => req(`/properties/${id}/view`, { method: "POST" }),

  // Favorites
  toggleFavorite: (property_id) =>
    req("/favorites/toggle", {
      method: "POST",
      body: JSON.stringify({ property_id }),
    }),
  listFavorites: () => req("/favorites"),
  favoriteIds: () => req("/favorites/ids"),

  // Marketplace
  marketplace: (params) => req(`/marketplace${qs(params)}`),
  marketplaceItem: (id) => req(`/marketplace/items/${id}`),
  marketplaceVendors: () => req("/marketplace/vendors"),

  // Neighborhoods
  neighborhoods: () => req("/neighborhoods"),

  // Wallet
  wallet: () => req("/wallet/me"),
  walletDual: () => req("/wallet/dual"),
  walletTransactions: (limit = 40) => req(`/wallet/transactions?limit=${limit}`),

  // Agent
  agentDashboard: () => req("/agent/dashboard"),
  agentListings: () => req("/agent/listings"),
  agentApply: (data) =>
    req("/agents/apply", { method: "POST", body: JSON.stringify(data) }),
  createProperty: (data) =>
    req("/properties", { method: "POST", body: JSON.stringify(data) }),

  // AI
  aiSearch: (query) =>
    req("/ai/search/sync", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),

  // Admin
  admin: {
    dashboard: () => req("/admin/dashboard"),
    properties: (params) => req(`/admin/properties${qs(params)}`),
    approveProperty: (id, data) =>
      req(`/admin/properties/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    deleteProperty: (id) => req(`/admin/properties/${id}`, { method: "DELETE" }),
    users: (params) => req(`/admin/users${qs(params)}`),
    updateUserRole: (id, data) =>
      req(`/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    agents: (params) => req(`/admin/agents${qs(params)}`),
    agentDecision: (userId, decision, verification_level) =>
      req(
        `/admin/agents/${userId}/decision${qs({ decision, verification_level })}`,
        { method: "POST" }
      ),
    marketplace: (params) => req(`/admin/marketplace${qs(params)}`),
    deleteMarketplaceItem: (id) =>
      req(`/admin/marketplace/${id}`, { method: "DELETE" }),
    orders: () => req("/admin/orders"),
    auditLog: (limit = 50) => req(`/admin/audit-log?limit=${limit}`),
    payments: () => req("/admin/payments"),
  },
};

export function formatNaira(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${Number(n).toLocaleString()}`;
}
