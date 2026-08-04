import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setToken, getToken } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (email, password) => {
    const res = await api.login({ email, password });
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const signUp = useCallback(async (data) => {
    const res = await api.register(data);
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const isAdmin =
    !!user &&
    (user.is_admin ||
      ["admin@amass.africa", "demo@amass.africa"].includes(
        (user.email || "").toLowerCase()
      ));

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signOut, refresh, isAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
