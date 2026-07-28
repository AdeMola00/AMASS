import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, WalletDto } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";

type WalletContextValue = {
  wallet: WalletDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
  purchase: (bundleId: string) => Promise<{ credited: number; balance: number }>;
  subscribe: (planId: string) => Promise<{ credited: number; balance: number }>;
  unlockProperty: (propertyId: string) => Promise<{
    tokens_paid: number;
    balance?: number;
    already_unlocked?: boolean;
    free?: boolean;
  }>;
  claimDailyLogin: () => Promise<{ credited?: number; already_claimed?: boolean }>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setWallet(null);
      return;
    }
    setLoading(true);
    try {
      const w = await api.wallet();
      setWallet(w);
    } catch {
      // silent
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

  const unlockProperty = useCallback(
    async (propertyId: string) => {
      const res = await api.unlockProperty(propertyId);
      await refresh();
      return {
        tokens_paid: res.tokens_paid ?? 0,
        balance: res.balance,
        already_unlocked: res.already_unlocked,
        free: res.free,
      };
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

  return (
    <WalletContext.Provider
      value={{ wallet, loading, refresh, purchase, subscribe, unlockProperty, claimDailyLogin }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
