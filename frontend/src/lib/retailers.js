import { useEffect, useState } from "react";
import api from "@/lib/api";

export const retailerKey = (p) => p.retailer_id || (p.seller ? `seller:${p.seller}` : "unknown");

export function groupRetailers(products) {
  const map = {};
  products.forEach((p) => {
    const k = retailerKey(p);
    if (!map[k]) map[k] = { id: k, name: p.seller || "Unknown seller", products: [], categories: new Set() };
    map[k].products.push(p);
    if (p.category_name) map[k].categories.add(p.category_name);
  });
  return Object.values(map).map((r) => {
    const by = (s) => r.products.filter((p) => (p.stock_status || "unknown") === s);
    const updated = r.products.map((p) => p.updated_at || p.created_at).filter(Boolean).sort().pop();
    return { ...r, categories: [...r.categories], in_stock: by("in_stock").length, out_of_stock: by("out_of_stock"),
      unknown: by("unknown").length, updated };
  });
}

export function useMarketplaceProducts() {
  const [state, setState] = useState({ products: [], loading: true, error: false });
  useEffect(() => {
    api.get("/marketplace/products")
      .then((r) => setState({ products: r.data, loading: false, error: false }))
      .catch(() => setState({ products: [], loading: false, error: true }));
  }, []);
  return state;
}
