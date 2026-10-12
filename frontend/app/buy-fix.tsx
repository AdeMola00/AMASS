import React from "react";
import { api } from "@/src/lib/api";
import { TokenPurchaseScreen } from "@/src/components/TokenPurchaseScreen";

export default function BuyFixScreen() {
  return (
    <TokenPurchaseScreen
      config={{
        currency: "FIX",
        title: "Buy FIX",
        heroTitle: "Top up your FIX",
        heroBody: "FIX unlocks premium FIXA features — priority listing, profile boosts and customer discounts. Verified pros also earn FIX on every completed job.",
        perks: [
          { icon: "rocket", label: "Priority listing" },
          { icon: "trending-up", label: "Profile boost" },
          { icon: "pricetag", label: "Customer discounts" },
          { icon: "shield-checkmark", label: "Verified pros" },
        ],
        bestBundleId: "fix_pro",
        providers: ["paystack", "flutterwave", "bank_transfer", "card"],
        loadBundles: () => api.listFixBundles(),
        testIDs: { bundle: "fix-bundle", provider: "fix-provider", confirm: "confirm-fix-purchase" },
      }}
    />
  );
}
