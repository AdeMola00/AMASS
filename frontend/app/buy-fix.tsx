import React from "react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/src/lib/api";
import { TokenPurchaseScreen } from "@/src/components/TokenPurchaseScreen";

export default function BuyFixScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  return (
    <TokenPurchaseScreen
      config={{
        currency: "FIX",
        title: "Buy FIX",
        heroTitle: "Top up your FIX",
        heroBody: "FIX opens FIXA — vetted plumbers, electricians, surveyors and more. Keep a balance to browse; pay only to unlock a provider's direct contact.",
        perks: [
          { icon: "construct", label: "Browse FIXA pros" },
          { icon: "call", label: "Unlock direct contacts" },
          { icon: "rocket", label: "Priority listing (pros)" },
          { icon: "shield-checkmark", label: "Verified pros" },
        ],
        bestBundleId: "fix_pro",
        providers: ["paystack", "flutterwave", "bank_transfer", "card"],
        loadBundles: () => api.listFixBundles(),
        testIDs: { bundle: "fix-bundle", provider: "fix-provider", confirm: "confirm-fix-purchase" },
        onSuccessRoute: returnTo ? { pathname: returnTo, params: { unlock: "1" } } : undefined,
      }}
    />
  );
}
