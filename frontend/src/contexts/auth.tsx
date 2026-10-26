import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, ApiError, AUTH_STORAGE_KEY, setUnauthorizedHandler, UserProfile } from "@/src/lib/api";
// Silent token refresh only — the permission prompt itself is contextual (see contexts/pushPrompt).
import { registerForPush, resetPushRegistration } from "@/src/lib/push";

/** Last good /auth/me — keeps the user signed in when the app opens offline or the API hiccups (502, timeout). */
const USER_CACHE_KEY = "amass.auth.user_cache";
const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401;

type AuthContextValue = {
  user: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, full_name: string, phone?: string) => Promise<void>;
  signInWithApple: (payload: { identity_token: string; full_name?: string; email?: string }) => Promise<void>;
  /** Phone OTP (and Google) flows already hold a token — adopt the session. */
  adoptSession: (access_token: string, user: UserProfile) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet<string>(AUTH_STORAGE_KEY, "");
      if (token) {
        try {
          const me = await api.me();
          setUser(me);
          storage.setItem(USER_CACHE_KEY, me).catch(() => {});
          registerForPush(me.id).catch(() => {});
        } catch (e) {
          if (isUnauthorized(e)) {
            // Token really is dead (expired / revoked) — sign out.
            await storage.secureRemove(AUTH_STORAGE_KEY);
            await storage.removeItem(USER_CACHE_KEY);
          } else {
            // Network blip or server error — stay signed in with the last known profile.
            const cached = await storage.getItem<UserProfile | null>(USER_CACHE_KEY, null);
            if (cached) setUser(cached);
          }
        }
      }
      setLoading(false);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    await storage.secureSet(AUTH_STORAGE_KEY, res.access_token);
    setUser(res.user);
    storage.setItem(USER_CACHE_KEY, res.user).catch(() => {});
    registerForPush(res.user.id).catch(() => {});
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, full_name: string, phone?: string) => {
      const res = await api.register({ email, password, full_name, phone });
      await storage.secureSet(AUTH_STORAGE_KEY, res.access_token);
      setUser(res.user);
      storage.setItem(USER_CACHE_KEY, res.user).catch(() => {});
      registerForPush(res.user.id).catch(() => {});
    },
    []
  );

  const signInWithApple = useCallback(
    async (payload: { identity_token: string; full_name?: string; email?: string }) => {
      const res = await api.appleSignIn(payload);
      await storage.secureSet(AUTH_STORAGE_KEY, res.access_token);
      setUser(res.user);
      storage.setItem(USER_CACHE_KEY, res.user).catch(() => {});
      registerForPush(res.user.id).catch(() => {});
    },
    []
  );

  const adoptSession = useCallback(async (access_token: string, u: UserProfile) => {
    await storage.secureSet(AUTH_STORAGE_KEY, access_token);
    setUser(u);
    storage.setItem(USER_CACHE_KEY, u).catch(() => {});
    registerForPush(u.id).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    await storage.secureRemove(AUTH_STORAGE_KEY);
    await storage.removeItem(USER_CACHE_KEY);
    resetPushRegistration();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      storage.setItem(USER_CACHE_KEY, me).catch(() => {});
      registerForPush(me.id).catch(() => {});
    } catch (e) {
      if (!isUnauthorized(e)) return; // keep the current session through transient errors
      await storage.secureRemove(AUTH_STORAGE_KEY);
      await storage.removeItem(USER_CACHE_KEY);
      setUser(null);
    }
  }, []);

  // A 401 on any authed call → re-check the session once; a dead token signs the user out (→ login screen).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      refresh();
    });
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithApple, adoptSession, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be within AuthProvider");
  return ctx;
}
