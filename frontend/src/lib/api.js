// AMASS unified API client — talks to the single production backend.
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
  register: (data) => req("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data) => req("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => req("/auth/me"),
  forgotPassword: (email) => req("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token, password) =>
    req("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) }),

  // Public CMS
  cmsLanding: () => req("/cms/landing"),
  cms: (key) => req(`/cms/${key}`),

  // Properties (public)
  listProperties: (params) => req(`/properties${qs(params)}`),
  getProperty: (id) => req(`/properties/${id}`),
  recordView: (id) => req(`/properties/${id}/view`, { method: "POST" }),

  // Favorites
  toggleFavorite: (property_id) =>
    req("/favorites/toggle", { method: "POST", body: JSON.stringify({ property_id }) }),
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

  // AI
  aiSearch: (query) =>
    req("/ai/search/sync", { method: "POST", body: JSON.stringify({ query }) }),

  // Admin
  admin: {
    dashboard: () => req("/admin/dashboard"),
    properties: (params) => req(`/admin/properties${qs(params)}`),
    approveProperty: (id, data) =>
      req(`/admin/properties/${id}/approve`, { method: "POST", body: JSON.stringify(data) }),
    deleteProperty: (id) => req(`/admin/properties/${id}`, { method: "DELETE" }),
    users: (params) => req(`/admin/users${qs(params)}`),
    updateUserRole: (id, data) =>
      req(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify(data) }),
    updateUserRoles: (id, roles) =>
      req(`/admin/users/${id}/roles`, { method: "PATCH", body: JSON.stringify({ roles }) }),
    agents: (params) => req(`/admin/agents${qs(params)}`),
    agentDecision: (userId, decision, verification_level) =>
      req(`/admin/agents/${userId}/decision${qs({ decision, verification_level })}`, { method: "POST" }),
    marketplace: (params) => req(`/admin/marketplace${qs(params)}`),
    deleteMarketplaceItem: (id) =>
      req(`/admin/marketplace/${id}`, { method: "DELETE" }),
    orders: () => req("/admin/orders"),
    auditLog: (limit = 50) => req(`/admin/audit-log?limit=${limit}`),
    payments: () => req("/admin/payments"),
    // CMS
    cmsLanding: () => req("/admin/cms/landing"),
    updateCmsLanding: (patch) =>
      req("/admin/cms/landing", { method: "PATCH", body: JSON.stringify(patch) }),
    resetCmsLanding: () => req("/admin/cms/landing/reset", { method: "POST" }),
    // Settings
    settings: () => req("/admin/settings"),
    updateSettings: (key, value) =>
      req("/admin/settings", { method: "PUT", body: JSON.stringify({ key, value }) }),
    // Broadcast
    broadcast: (data) =>
      req("/admin/notifications/broadcast", { method: "POST", body: JSON.stringify(data) }),
  },
};

export function formatNaira(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${Number(n).toLocaleString()}`;
}
