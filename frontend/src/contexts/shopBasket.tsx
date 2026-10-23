/**
 * Shop basket state (per-retailer baskets live on the server; this keeps the header badge and
 * per-product quantities in sync across screens with optimistic updates).
 * The basket never checks out in-app — it hands off to the retailer (see PurchaseRoutes).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { track } from "@/src/lib/analytics";

type Ctx = {
  count: number;
  qtyOf: (productId: string) => number;
  add: (productId: string, retailerSlug?: string) => Promise<void>;
  setQty: (productId: string, qty: number) => Promise<void>;
  /** Replace local quantities from a full basket payload (basket screen). */
  hydrate: (items: { product_id: string; qty: number }[]) => void;
  refresh: () => Promise<void>;
};

const ShopBasketContext = createContext<Ctx | null>(null);

export function ShopBasketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [qty, setQtyMap] = useState<Record<string, number>>({});
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setQtyMap({});
      return;
    }
    try {
      const b = await api.shopBasket();
      const next: Record<string, number> = {};
      b.groups.forEach((g) => g.items.forEach((i) => (next[i.product.id] = i.qty)));
      setQtyMap(next);
      loaded.current = true;
    } catch {
      /* keep what we have — offline or not signed in */
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (productId: string, retailerSlug?: string) => {
      if (!user) throw new Error("Sign in to add items to your basket");
      setQtyMap((m) => ({ ...m, [productId]: (m[productId] ?? 0) + 1 }));
      try {
        const r = await api.shopBasketAdd(productId, 1);
        setQtyMap((m) => ({ ...m, [productId]: r.qty }));
        track("shop_add_to_basket", { product_id: productId, retailer: retailerSlug ?? r.retailer_id });
      } catch (e) {
        setQtyMap((m) => ({ ...m, [productId]: Math.max(0, (m[productId] ?? 1) - 1) }));
        throw e;
      }
    },
    [user]
  );

  const setQty = useCallback(async (productId: string, q: number) => {
    const prev = qty[productId] ?? 0;
    setQtyMap((m) => ({ ...m, [productId]: q }));
    try {
      const b = await api.shopBasketSetQty(productId, q);
      const next: Record<string, number> = {};
      b.groups.forEach((g) => g.items.forEach((i) => (next[i.product.id] = i.qty)));
      setQtyMap(next);
    } catch (e) {
      setQtyMap((m) => ({ ...m, [productId]: prev }));
      throw e;
    }
  }, [qty]);

  const hydrate = useCallback((items: { product_id: string; qty: number }[]) => {
    const next: Record<string, number> = {};
    items.forEach((i) => (next[i.product_id] = i.qty));
    setQtyMap(next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      count: Object.values(qty).reduce((a, b) => a + b, 0),
      qtyOf: (id) => qty[id] ?? 0,
      add,
      setQty,
      hydrate,
      refresh,
    }),
    [qty, add, setQty, hydrate, refresh]
  );

  return <ShopBasketContext.Provider value={value}>{children}</ShopBasketContext.Provider>;
}

export function useShopBasket(): Ctx {
  const ctx = useContext(ShopBasketContext);
  if (!ctx) throw new Error("useShopBasket must be used inside ShopBasketProvider");
  return ctx;
}
