import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, WalletDto } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";

type WalletContextValue = {
  /** Alias of `mass` — MASS is the only token in the app. */
  wallet: WalletDto | null;
  /** MASS wallet (property access + map time). */
  mass: WalletDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
  purchase: (bundleId: string) => Promise<{ credited: number; balance: number }>;
  subscribe: (planId: string) => Promise<{ credited: number; balance: number }>;
  claimDailyLogin: () => Promise<{ credited?: number; already_claimed?: boolean }>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mass, setMass] = useState<WalletDto | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setMass(null);
      return;
    }
    setLoading(true);
    try {
      setMass(await api.wallet());
    } catch {
      // keep the last known balance — the next refresh (focus / purchase) retries
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const purchase = useCallback(
    async (bundleId: string) => {
      const res = await api.purchaseTokens(bundleId);
      await refresh();
      return { credited: res.credited, balance: res.balance };
    },
    [refresh]
  );

  const subscribe = useCallback(
    async (planId: string) => {
      const res = await api.subscribe(planId);
      await refresh();
      return { credited: res.credited, balance: res.balance };
    },
    [refresh]
  );

  const claimDailyLogin = useCallback(async () => {
    try {
      const res = await api.earnDailyLogin();
      await refresh();
      if (res.ok) return { credited: res.credited };
      return { already_claimed: res.reason === "already_claimed_today" };
    } catch {
      return {};
    }
  }, [refresh]);

  return <WalletContext.Provider value={{ wallet: mass, mass, loading, refresh, purchase, subscribe, claimDailyLogin }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
