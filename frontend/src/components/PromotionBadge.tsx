import React from "react";
import type { PromotionInfo, PromotionTier } from "@/src/lib/api";
import { Badge, FrostedLabel, type IconName } from "@/src/ui";

/** Tier meta shared by cards, pins, the dashboard and the Boost studio. */
export const TIER_META: Record<PromotionTier, { label: string; icon: IconName; gradient: readonly [string, string, string] }> = {
  promote: { label: "Promoted", icon: "trending-up", gradient: ["#3A3A38", "#1C1C1A", "#111111"] },
  feature: { label: "Featured", icon: "star", gradient: ["#F7E29A", "#D9B547", "#A9842B"] },
  boost: { label: "Boosted", icon: "rocket", gradient: ["#F0262E", "#B8151A", "#7A0C12"] },
};

/** Gold text on frosted glass — sits on photography, identical in both themes. */
const PHOTO_LABEL_COLOR = "#7A5E10";

export function PromotionPhotoLabel({ promotion, size = "xs", testID }: { promotion?: PromotionInfo | null; size?: "xs" | "sm"; testID?: string }) {
  if (!promotion?.tier) return null;
  const m = TIER_META[promotion.tier];
  return <FrostedLabel label={m.label} icon={m.icon} tone="light" color={PHOTO_LABEL_COLOR} size={size} testID={testID ?? `promo-label-${promotion.tier}`} />;
}

export function PromotionBadge({ promotion, withDays, testID }: { promotion?: PromotionInfo | null; withDays?: boolean; testID?: string }) {
  if (!promotion?.tier) return null;
  const m = TIER_META[promotion.tier];
  const label = withDays ? `${m.label} · ${promotion.days_left}d left` : m.label;
  return <Badge label={label} icon={m.icon} tone={promotion.tier === "boost" ? "brand" : "mass"} size="xs" testID={testID ?? `promo-badge-${promotion.tier}`} />;
}
