import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, AUTH_STORAGE_KEY, UserProfile } from "@/src/lib/api";
// Silent token refresh only — the permission prompt itself is contextual (see contexts/pushPrompt).
import { registerForPush, resetPushRegistration } from "@/src/lib/push";

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
          registerForPush(me.id).catch(() => {});
        } catch {
          await storage.secureRemove(AUTH_STORAGE_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    await storage.secureSet(AUTH_STORAGE_KEY, res.access_token);
    setUser(res.user);
    registerForPush(res.user.id).catch(() => {});
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, full_name: string, phone?: string) => {
      const res = await api.register({ email, password, full_name, phone });
      await storage.secureSet(AUTH_STORAGE_KEY, res.access_token);
      setUser(res.user);
      registerForPush(res.user.id).catch(() => {});
    },
    []
  );

  const signInWithApple = useCallback(
    async (payload: { identity_token: string; full_name?: string; email?: string }) => {
      const res = await api.appleSignIn(payload);
      await storage.secureSet(AUTH_STORAGE_KEY, res.access_token);
      setUser(res.user);
      registerForPush(res.user.id).catch(() => {});
    },
    []
  );

  const adoptSession = useCallback(async (access_token: string, u: UserProfile) => {
    await storage.secureSet(AUTH_STORAGE_KEY, access_token);
    setUser(u);
    registerForPush(u.id).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    await storage.secureRemove(AUTH_STORAGE_KEY);
    resetPushRegistration();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      registerForPush(me.id).catch(() => {});
    } catch {
      await storage.secureRemove(AUTH_STORAGE_KEY);
      setUser(null);
    }
  }, []);

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
