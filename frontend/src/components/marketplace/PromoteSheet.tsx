/**
 * Promote a Declutter listing — the only ad-campaign entry point in the consumer app.
 * Pick a tier (paid in MASS, debited instantly by POST /ads), the item becomes the ad creative.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, ApiError, MarketplaceItem } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Sheet, Skeleton, useCelebrate, useToast, type IconName } from "@/src/ui";

type Tier = { key: string; tokens: number; days: number; label: string; perk: string };

/** Marketplace tiers only — "map" promotes a property pin and belongs to the Agent app. */
const ITEM_TIERS = ["basic", "featured", "spotlight", "premium"] as const;
const TIER_ICON: Record<string, IconName> = { basic: "trending-up", featured: "ribbon", spotlight: "sparkles", premium: "rocket" };
/** Short names that fit a phone row; the backend label is still used in the confirmation. */
const TIER_NAME: Record<string, string> = { basic: "Basic", featured: "Featured", spotlight: "Spotlight", premium: "Premium ad" };

export function PromoteSheet({ item, onClose, onCreated }: { item: MarketplaceItem | null; onClose: () => void; onCreated: (ad: any) => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const { mass, refresh } = useWallet();
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [tier, setTier] = useState<string>("featured");
  const [busy, setBusy] = useState(false);

  const { height } = useWindowDimensions();
  const itemId = item?.id;

  useEffect(() => {
    if (!itemId || tiers) return;
    api
      .adTiers()
      .then((t) => setTiers(ITEM_TIERS.filter((k) => t[k]).map((k) => ({ key: k, ...t[k] }))))
      .catch(() => {
        toast.error("Couldn't load promotion options", "Please try again.");
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const chosen = useMemo(() => tiers?.find((t) => t.key === tier) ?? null, [tiers, tier]);
  const walletReady = mass !== null;
  const balance = mass?.spendable ?? 0;
  const short = chosen && walletReady ? Math.max(0, chosen.tokens - balance) : 0;

  const promote = async () => {
    if (!item || !chosen) return;
    setBusy(true);
    try {
      const ad = await api.createAd({
        marketplace_item_id: item.id,
        tier: chosen.key,
        title: item.name,
        description: (item.description || `${item.name} · ${formatNaira(item.price)}`).slice(0, 160),
        cta_label: "View item",
        media: [{ kind: "image", url: item.images?.[0] || item.image }],
        target_categories: item.category ? [item.category] : [],
        target_cities: item.city ? [item.city] : [],
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      refresh().catch(() => {});
      celebrate({ title: `${chosen.label} is live`, body: `${item.name} · ${chosen.days} days`, icon: "megaphone", tone: "mass" });
      onCreated(ad);
    } catch (e: any) {
      const detail = e instanceof ApiError ? e.detail : null;
      if (e instanceof ApiError && e.status === 402) {
        toast.error("Not enough MASS", `You need ${detail?.shortfall ?? chosen.tokens} more MASS for this promotion.`);
      } else {
        toast.error("Couldn't start the promotion", typeof detail === "string" ? detail : e?.message ?? "Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!item} onClose={onClose} title="Promote this listing" testID="promote-sheet">
      {item ? (
        <View style={{ gap: 12 }}>
          <AppText variant="bodySm" tone="secondary" numberOfLines={3}>
            “{item.name}” gets shown to more buyers in Declutter. Paid once in MASS, pause anytime from My Ad Campaigns.
          </AppText>

          {/* Tier list scrolls on short phones; balance + CTA stay pinned below it. */}
          <ScrollView style={{ maxHeight: Math.max(180, height * 0.42) }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false} bounces={false}>
          {!tiers ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={68} radius={14} />
              <Skeleton height={68} radius={14} />
              <Skeleton height={68} radius={14} />
            </View>
          ) : (
            tiers.map((t) => {
              const selected = t.key === tier;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTier(t.key);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${t.label}, ${t.tokens} MASS for ${t.days} days. ${t.perk}`}
                  style={[styles.tier, { borderColor: selected ? colors.mass : colors.border, backgroundColor: selected ? colors.massSoft : colors.surface }]}
                  testID={`promote-tier-${t.key}`}
                >
                  <View style={[styles.tierIcon, { backgroundColor: selected ? colors.mass : colors.surfaceAlt }]}>
                    <Ionicons name={TIER_ICON[t.key] ?? "megaphone"} size={18} color={selected ? "#1A1200" : colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <AppText variant="title" style={{ flexShrink: 1 }} numberOfLines={1}>
                        {TIER_NAME[t.key] ?? t.label}
                      </AppText>
                      {t.key === "featured" ? <Badge label="Popular" tone="mass" size="xs" /> : null}
                    </View>
                    <AppText variant="caption" tone="tertiary" numberOfLines={2}>
                      {t.perk} · {t.days} days
                    </AppText>
                  </View>
                  <AppText variant="bodyMedium" weight="bold" tabular>
                    {t.tokens} MASS
                  </AppText>
                </Pressable>
              );
            })
          )}
          </ScrollView>

          <View style={[styles.balance, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="wallet-outline" size={16} color={colors.textSecondary} />
            <AppText variant="caption" tone="secondary" tabular style={{ flex: 1 }}>
              {walletReady ? `Balance ${balance} MASS` : "Checking balance…"}
            </AppText>
            {short > 0 ? (
              <AppText variant="caption" tone="error" tabular testID="promote-shortfall">
                {short} MASS short
              </AppText>
            ) : null}
          </View>

          {short > 0 ? (
            <Button label="Top up MASS" variant="premium" size="lg" fullWidth iconLeft="add" onPress={() => { onClose(); router.push("/buy-tokens?currency=MASS" as any); }} testID="promote-topup" />
          ) : (
            <Button label={chosen ? `Promote · ${chosen.tokens} MASS` : "Promote"} variant="primary" size="lg" fullWidth iconLeft="megaphone" loading={busy || !walletReady} disabled={!chosen || !walletReady} onPress={promote} testID="promote-submit" />
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tier: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.lg, borderWidth: 1.5 },
  tierIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  balance: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 40, borderRadius: radii.pill, marginTop: space[1] },
});
