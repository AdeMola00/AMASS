import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, Cart } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";

type CartContextValue = {
  cart: Cart;
  count: number;
  loading: boolean;
  refresh: () => Promise<void>;
  add: (id: string, quantity?: number) => Promise<void>;
  update: (id: string, quantity: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
};

const EMPTY: Cart = { items: [], subtotal: 0 };
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setCart(EMPTY);
      return;
    }
    try {
      setLoading(true);
      const c = await api.getCart();
      setCart(c || EMPTY);
    } catch {
      setCart(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(async (id: string, quantity: number = 1) => {
    if (!user) return;
    const next = await api.cartAdd(id, quantity);
    setCart(next);
  }, [user]);

  const update = useCallback(async (id: string, quantity: number) => {
    if (!user) return;
    const next = await api.cartUpdate(id, quantity);
    setCart(next);
  }, [user]);

  const remove = useCallback(async (id: string) => {
    if (!user) return;
    const next = await api.cartRemove(id);
    setCart(next);
  }, [user]);

  const clear = useCallback(async () => {
    if (!user) return;
    const next = await api.cartClear();
    setCart(next);
  }, [user]);

  const count = cart.items.reduce((n, l) => n + l.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, count, loading, refresh, add, update, remove, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
