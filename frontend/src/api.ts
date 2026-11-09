import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const TOKEN_KEY = "amass_partner_token";
export const KIND_KEY = "amass_partner_kind";

export type AccountKind = "user" | "brand";

let memToken: string | null = null;
export async function getToken() {
  if (memToken) return memToken;
  memToken = (await storage.secureGet<string | null>(TOKEN_KEY, null)) as string | null;
  return memToken;
}
export async function saveSession(token: string, kind: AccountKind) {
  memToken = token;
  await storage.secureSet(TOKEN_KEY, token);
  await storage.setItem(KIND_KEY, kind);
}
export async function clearSession() {
  memToken = null;
  await storage.secureRemove(TOKEN_KEY);
  await storage.removeItem(KIND_KEY);
}
export async function getKind(): Promise<AccountKind> {
  return ((await storage.getItem<string>(KIND_KEY, "user")) as AccountKind) || "user";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const tok = await getToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }
  const res = await fetch(`${BACKEND_URL}/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && opts.auth !== false) onUnauthorized?.();
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const j = await res.json();
      const d = j?.detail;
      msg = typeof d === "string" ? d : d?.message || (Array.isArray(d) ? d[0]?.msg : msg) || msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function absUrl(u?: string | null) {
  if (!u) return undefined;
  return u.startsWith("/") ? `${BACKEND_URL}${u}` : u;
}

export function naira(n?: number | null) {
  if (n == null) return "₦0";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}
