import React from "react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/src/lib/api";
import { TokenPurchaseScreen } from "@/src/components/TokenPurchaseScreen";

export default function BuyTokensScreen() {
  const { returnTo, unlock } = useLocalSearchParams<{ returnTo?: string; unlock?: string }>();
  return (
    <TokenPurchaseScreen
      config={{
        currency: "MASS",
        title: "Buy MASS",
        heroTitle: "Top up your MASS",
        heroBody: "MASS unlocks premium property information — exact addresses, every photo, agent contacts, documents and more.",
        perks: [
          { icon: "location", label: "Exact addresses" },
          { icon: "call", label: "Agent contacts" },
          { icon: "document-text", label: "Documents" },
          { icon: "sparkles", label: "AI insights" },
        ],
        bestBundleId: "investor",
        providers: ["paystack", "flutterwave"],
        loadBundles: () => api.listBundles(),
        testIDs: { bundle: "bundle", provider: "provider", confirm: "confirm-purchase-btn" },
        // Came from an unlock flow — take the buyer straight back to finish.
        onSuccessRoute: returnTo ? { pathname: returnTo, params: unlock ? { unlock } : undefined } : undefined,
      }}
    />
  );
}
