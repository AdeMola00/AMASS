import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { AccountKind, api, ApiError, clearSession, getKind, getToken, saveSession, setUnauthorizedHandler } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type Role = "agent" | "seller" | "fixa" | "brand";

export type PartnerMe = {
  user: { id: string; full_name: string; email: string; phone?: string; avatar_url?: string };
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
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);
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

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
    });
    (async () => {
      const tok = await getToken();
      if (!tok) return setStatus("out");
      try {
        await load(await getKind());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await signOut();
        else setStatus("out");
      }
    })();
  }, [load, signOut]);

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

  return <AuthCtx.Provider value={{ status, kind, me, brand, roles, role, setRole, refresh, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
