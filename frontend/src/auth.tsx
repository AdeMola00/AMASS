import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { AccountKind, api, ApiError, clearSession, getKind, getToken, saveSession, setUnauthorizedHandler } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type Role = "agent" | "seller" | "fixa" | "brand";

export type PartnerMe = {
  user: { id: string; full_name: string; email: string; phone?: string; avatar_url?: string; face_verified?: boolean };
  roles: Role[];
  fixa: { status: string; item_id: string; name: string } | null;
  counts: Record<string, number>;
  listing_quota: { plan_name: string; limit: number; used: number; can_add: boolean } | null;
};
export type BrandMe = { account: { id: string; name: string; email: string }; brand: any; categories: { key: string; label: string; icon: string }[] };

type Ctx = {
  status: "loading" | "out" | "in";
  kind: AccountKind;
  me: PartnerMe | null;
  brand: BrandMe | null;
  roles: Role[];
  role: Role | null;
  setRole: (r: Role) => void;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  googleFailed: boolean;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

WebBrowser.maybeCompleteAuthSession();

// Emergent returns session_id in the hash (#session_id=) or query (?session_id=).
function extractSessionId(url?: string | null) {
  const m = url ? url.match(/[?#&]session_id=([^&#]+)/) : null;
  return m ? decodeURIComponent(m[1]) : null;
}

function cleanWebUrl() {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  u.searchParams.delete("session_id");
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  hash.delete("session_id");
  const h = hash.toString();
  window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${h ? `#${h}` : ""}`);
}
const ROLE_KEY = "amass_partner_role";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Ctx["status"]>("loading");
  const [kind, setKind] = useState<AccountKind>("user");
  const [me, setMe] = useState<PartnerMe | null>(null);
  const [brand, setBrand] = useState<BrandMe | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);

  const load = useCallback(async (k: AccountKind) => {
    const saved = (await storage.getItem<string | null>(ROLE_KEY, null)) as Role | null;
    if (k === "brand") {
      const b = await api<BrandMe>("/brand/me");
      setBrand(b);
      setMe(null);
      setRoleState("brand");
    } else {
      const m = await api<PartnerMe>("/partner/me");
      setMe(m);
      setBrand(null);
      setRoleState((cur) => {
        const pick = cur && m.roles.includes(cur) ? cur : saved && m.roles.includes(saved) ? saved : m.roles[0] ?? null;
        return pick;
      });
    }
    setKind(k);
    setStatus("in");
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    await storage.removeItem(ROLE_KEY);
    setMe(null);
    setBrand(null);
    setRoleState(null);
    setStatus("out");
  }, []);

  const sent = useRef(new Set<string>());
  const [googleFailed, setGoogleFailed] = useState(false);
  // Exchange the one-time Google session_id for the normal AMASS JWT (same account as email login).
  const exchange = useCallback(
    async (sessionId: string) => {
      if (sent.current.has(sessionId)) return false;
      sent.current.add(sessionId);
      const r = await api<{ access_token: string }>("/auth/google-session", { body: { session_id: sessionId }, auth: false });
      await saveSession(r.access_token, "user");
      await load("user");
      return true;
    },
    [load],
  );

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) exchange(sid).catch(() => setStatus("out"));
    });
    return () => sub.remove();
  }, [exchange]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
    });
    (async () => {
      // A Google redirect comes first, before any stored session.
      const startUrl = Platform.OS === "web" ? (typeof window !== "undefined" ? window.location.href : null) : await Linking.getInitialURL();
      const sid = extractSessionId(startUrl);
      if (sid) {
        try {
          if (await exchange(sid)) {
            if (Platform.OS === "web") cleanWebUrl();
            return;
          }
        } catch {
          setGoogleFailed(true);
          if (Platform.OS === "web") cleanWebUrl();
        }
      }
      const tok = await getToken();
      if (!tok) return setStatus("out");
      try {
        await load(await getKind());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await signOut();
        else setStatus("out");
      }
    })();
  }, [load, signOut, exchange]);

  const signInWithGoogle = async () => {
    const redirectUrl = Platform.OS === "web" ? `${window.location.origin}/` : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => {
      captured = url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      const url = (result.type === "success" ? result.url : null) || captured || (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (!sid) {
        if (result.type === "cancel" || result.type === "dismiss") return;
        throw new Error("Google sign-in did not finish");
      }
      await exchange(sid);
    } finally {
      sub.remove();
    }
  };

  const signIn = async (email: string, password: string) => {
    const body = { email: email.trim().toLowerCase(), password };
    try {
      const r = await api<{ access_token: string }>("/auth/login", { body, auth: false });
      await saveSession(r.access_token, "user");
      await load("user");
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      // Not an app user — maybe a brand login (separate AMASS brand portal account).
      const b = await api<{ token: string }>("/brand/auth/login", { body, auth: false });
      await saveSession(b.token, "brand");
      await load("brand");
    }
  };

  const setRole = (r: Role) => {
    setRoleState(r);
    storage.setItem(ROLE_KEY, r);
  };

  const refresh = useCallback(async () => {
    try {
      await load(kind);
    } catch {}
  }, [kind, load]);

  const roles: Role[] = kind === "brand" ? ["brand"] : me?.roles ?? [];

  return <AuthCtx.Provider value={{ status, kind, me, brand, roles, role, setRole, refresh, signIn, signInWithGoogle, googleFailed, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
