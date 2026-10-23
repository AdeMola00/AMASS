/**
 * Boost Studio — Promote · Feature · Boost one listing with a live preview of
 * every placement it unlocks (results, Featured rail, map pin, buyer alerts),
 * a reach estimate and a transparent MASS charge (ChargeConfirm).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { api, ApiError, type PromotionPreview, type PromotionTier } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { formatMarkerPrice } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { gradients, radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, ChargeConfirm, EmptyState, Gloss, PressableScale, Screen, ScreenHeader, Skeleton, StatTile, useReducedMotion, useToast, type IconName } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";
import { AmassLogo } from "@/src/components/AmassLogo";
import { TIER_META } from "@/src/components/PromotionBadge";

const TIERS: PromotionTier[] = ["promote", "feature", "boost"];
type Placement = "results" | "featured" | "map" | "alerts";
const PLACEMENT_ORDER: Placement[] = ["results", "featured", "map", "alerts"];
const PLACEMENT_ICON: Record<Placement, IconName> = { results: "list", featured: "star", map: "location", alerts: "notifications" };
const GOLD = "#D9B547"; // highlight ring + labels on the mock screens (brand token colour)

export default function BoostStudio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { refresh } = useWallet();
  const [data, setData] = useState<PromotionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<PromotionTier>("feature");
  const [placement, setPlacement] = useState<Placement>("results");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [done, setDone] = useState<Awaited<ReturnType<typeof api.promoteListing>> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const d = await api.promotionPreview(id);
      setData(d);
      if (d.active?.tier) setTier(d.active.tier);
    } catch (e: any) {
      setError(e instanceof ApiError && e.status === 403 ? "Only the listing agent can boost this property." : (e?.message ?? "Couldn't load boost options."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const cfg = data?.tiers[tier];
  const included = useMemo(() => new Set<Placement>((cfg?.placements as Placement[]) ?? []), [cfg]);
  useEffect(() => {
    if (!included.has(placement)) setPlacement(PLACEMENT_ORDER.find((p) => included.has(p)) ?? "results");
  }, [included, placement]);

  const pickTier = (t: PromotionTier) => {
    Haptics.selectionAsync().catch(() => {});
    setTier(t);
  };

  const activate = async () => {
    if (!id || !cfg) return;
    setBusy(true);
    setChargeError(null);
    try {
      const r = await api.promoteListing(id, tier);
      await refresh().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConfirm(false);
      setDone(r);
    } catch (e: any) {
      const detail = e instanceof ApiError ? e.detail : null;
      setChargeError(detail && typeof detail === "object" && detail.error === "insufficient_tokens" ? `You need ${detail.shortfall} more MASS. No charge was made.` : (e?.message ?? "Couldn't activate. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen testID="boost-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Boost listing" />
        <View style={{ padding: space[4], gap: 14 }}>
          <Skeleton height={76} radius={radii.lg} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Skeleton height={120} radius={radii.lg} style={{ flex: 1 }} />
            <Skeleton height={120} radius={radii.lg} style={{ flex: 1 }} />
            <Skeleton height={120} radius={radii.lg} style={{ flex: 1 }} />
          </View>
          <Skeleton height={320} radius={radii.xl} />
        </View>
      </Screen>
    );
  }

  if (error || !data || !cfg) {
    return (
      <Screen testID="boost-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Boost listing" />
        <EmptyState variant="error" icon="rocket-outline" title="Boost unavailable" body={error ?? "Please try again."} actionLabel="Retry" onAction={load} secondaryLabel="Go back" onSecondary={() => router.back()} testID="boost-error" />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen testID="boost-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Boost listing" />
        <SuccessPanel result={done} preview={data} onViewListing={() => router.replace(`/property/${id}` as any)} onMap={() => router.replace("/(tabs)" as any)} onDone={() => router.back()} />
      </Screen>
    );
  }

  const p = data.property;
  const meta = TIER_META[tier];
  const reach = data.reach;

  return (
    <Screen testID="boost-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Boost listing" subtitle="Promote · Feature · Boost" backTestID="boost-back" />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: insets.bottom + 120, gap: space[5] }} showsVerticalScrollIndicator={false}>
        {/* Listing + current state */}
        <Card elevation="xs" padded={false} testID="boost-listing">
          <View style={styles.listingRow}>
            <Image source={{ uri: p.image ?? undefined }} style={[styles.listingImg, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="title" numberOfLines={1}>
                {p.title}
              </AppText>
              <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                {p.location}
                {p.city ? `, ${p.city}` : ""}
              </AppText>
              <AppText variant="bodyMedium" tabular>
                {formatMarkerPrice(p.price ?? 0, p.listing_type ?? "buy")}
              </AppText>
            </View>
          </View>
          {data.active ? (
            <LinearGradient colors={[...TIER_META[data.active.tier].gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activeBar} testID="boost-active-banner">
              <Gloss height="60%" />
              <Ionicons name={TIER_META[data.active.tier].icon} size={14} color="#fff" />
              <AppText variant="caption" color="#fff" style={{ flex: 1 }}>
                {TIER_META[data.active.tier].label} is live · {data.active.days_left} day{data.active.days_left === 1 ? "" : "s"} left
              </AppText>
              <AppText variant="micro" color="rgba(255,255,255,0.8)">
                Same tier extends it
              </AppText>
            </LinearGradient>
          ) : null}
        </Card>

        {/* Tier picker */}
        <View style={{ gap: space[3] }}>
          <AppText variant="h3">Choose a level</AppText>
          <View style={styles.tiersRow}>
            {TIERS.map((k, i) => (
              <TierCard key={k} tier={k} cfg={data.tiers[k]} active={tier === k} onPress={() => pickTier(k)} index={i} />
            ))}
          </View>
          <View style={[styles.perk, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="sparkles" size={14} color={colors.massText} />
            <AppText variant="caption" tone="secondary" style={{ flex: 1 }} testID="boost-perk">
              {cfg.perk}
            </AppText>
          </View>
        </View>

        {/* Live placement preview */}
        <View style={{ gap: space[3] }}>
          <View style={styles.sectionHead}>
            <AppText variant="h3">Where you&apos;ll appear</AppText>
            <AppText variant="caption" tone="tertiary">
              Live preview
            </AppText>
          </View>
          <View style={styles.placementRow}>
            {PLACEMENT_ORDER.map((pl) => {
              const on = included.has(pl);
              const sel = placement === pl;
              return (
                <PressableScale
                  key={pl}
                  onPress={() => {
                    if (!on) {
                      const needed = TIERS.find((t) => (data.tiers[t].placements as Placement[]).includes(pl));
                      toast.info(`Included with ${needed ? data.tiers[needed].label : "a higher level"}`, data.placements[pl]?.caption);
                      return;
                    }
                    Haptics.selectionAsync().catch(() => {});
                    setPlacement(pl);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: sel, disabled: !on }}
                  style={[styles.placementChip, { backgroundColor: sel ? colors.surfaceInverse : colors.surfaceAlt, opacity: on ? 1 : 0.55 }]}
                  testID={`placement-${pl}${on ? "" : "-locked"}`}
                >
                  <Ionicons name={on ? PLACEMENT_ICON[pl] : "lock-closed"} size={13} color={sel ? colors.textInverse : colors.text} />
                  <AppText variant="micro" color={sel ? colors.textInverse : colors.text} numberOfLines={1}>
                    {data.placements[pl]?.label ?? pl}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
          <PhonePreview placement={placement} tier={tier} preview={data} />
          <AppText variant="caption" tone="tertiary" testID="placement-caption">
            {data.placements[placement]?.caption}
          </AppText>
        </View>

        {/* Reach */}
        <View style={{ gap: space[3] }}>
          <AppText variant="h3">Expected reach</AppText>
          <View style={styles.statsRow}>
            <StatTile icon="eye" tone="mass" value={cfg.estimated_views} label={`Est. views · ${cfg.days}d`} animate testID="reach-views" />
            <StatTile icon="trophy" tone="default" value={`#${reach.current_rank} → #1`} label={`Rank in ${reach.city || "your city"}`} testID="reach-rank" />
          </View>
          <View style={styles.statsRow}>
            <StatTile icon="people" tone={included.has("alerts") ? "brand" : "default"} value={reach.matched_buyers} label={included.has("alerts") ? "Buyers alerted" : "Buyers matching"} testID="reach-buyers" />
            <StatTile icon="walk" tone="info" value={reach.city_seekers_30d} label="Active seekers · 30d" testID="reach-seekers" />
          </View>
          <AppText variant="micro" tone="tertiary">
            Estimates use your last 30 days of views × the typical uplift for this level. {reach.competing_listings} other {p.listing_type === "rent" ? "rentals" : "listings"} compete in {reach.city || "this area"}
            {reach.promoted_competitors > 0 ? `, ${reach.promoted_competitors} already promoted` : ""}.
          </AppText>
        </View>

        {/* What's included */}
        <Card tone="soft" style={{ gap: 10 }} testID="boost-includes">
          {PLACEMENT_ORDER.map((pl) => {
            const on = included.has(pl);
            return (
              <View key={pl} style={styles.includeRow}>
                <Ionicons name={on ? "checkmark-circle" : "remove-circle-outline"} size={18} color={on ? colors.success : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium" tone={on ? "primary" : "tertiary"}>
                    {data.placements[pl]?.label}
                  </AppText>
                  <AppText variant="caption" tone="tertiary">
                    {data.placements[pl]?.caption}
                  </AppText>
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>

      {/* Sticky cost + CTA */}
      <View style={[styles.sticky, { backgroundColor: colors.bgElevated, paddingBottom: Math.max(insets.bottom, 12) + 4, borderTopColor: colors.border }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TokenIcon size={16} />
            <AppText variant="title" tabular numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }} testID="boost-cost">
              {cfg.tokens.toLocaleString()} MASS · {cfg.days}d
            </AppText>
          </View>
          <AppText variant="micro" tone={cfg.affordable ? "tertiary" : "error"} tabular numberOfLines={1} testID="boost-balance-line">
            {cfg.affordable ? `${data.balance.toLocaleString()} → ${cfg.balance_after.toLocaleString()} MASS after` : `Need ${(cfg.tokens - data.balance).toLocaleString()} more MASS`}
          </AppText>
        </View>
        {cfg.affordable ? (
          <Button label={cfg.extends_active ? `Extend ${cfg.label}` : `Activate ${cfg.label}`} variant="brand" size="md" iconLeft={meta.icon} onPress={() => setConfirm(true)} testID="boost-activate" />
        ) : (
          <Button label="Top up MASS" variant="premium" size="md" iconLeft="add" onPress={() => router.push(`/buy-tokens?returnTo=${encodeURIComponent(`/agent/boost/${id}`)}` as any)} testID="boost-topup" />
        )}
      </View>

      <ChargeConfirm
        visible={confirm}
        onClose={() => {
          setConfirm(false);
          setChargeError(null);
        }}
        onConfirm={activate}
        title={`${cfg.extends_active ? "Extend" : "Activate"} ${cfg.label}`}
        description={`${p.title} · live for ${cfg.days} days${cfg.extends_active ? " more" : ""}.`}
        cost={cfg.tokens}
        balance={data.balance}
        loading={busy}
        error={chargeError}
        icon={meta.icon}
        confirmLabel={`Confirm · ${cfg.tokens.toLocaleString()} MASS`}
        onTopUp={() => router.push("/buy-tokens" as any)}
        testID="boost-confirm"
      />
    </Screen>
  );
}

/* ─── Tier card ─────────────────────────────────────────────────────────── */
function TierCard({ tier, cfg, active, onPress, index }: { tier: PromotionTier; cfg: PromotionPreview["tiers"][PromotionTier]; active: boolean; onPress: () => void; index: number }) {
  const { colors, shadows } = useTheme();
  const reduce = useReducedMotion();
  const m = TIER_META[tier];
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(60 * index).duration(260)} style={{ flex: 1 }}>
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${cfg.label}, ${cfg.tokens} MASS for ${cfg.days} days`} style={[styles.tier, { backgroundColor: colors.surfaceAlt }, active && shadows.md]} testID={`boost-tier-${tier}`}>
        {active ? (
          <LinearGradient colors={[...m.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
            <Gloss />
          </LinearGradient>
        ) : null}
        <View style={[styles.tierIcon, { backgroundColor: active ? "rgba(255,255,255,0.18)" : colors.surface }]}>
          <Ionicons name={m.icon} size={18} color={active ? "#fff" : colors.text} />
        </View>
        <AppText variant="caption" weight="bold" color={active ? "#fff" : colors.text}>
          {cfg.label}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <TokenIcon size={12} />
          <AppText variant="title" tabular color={active ? "#fff" : colors.text}>
            {cfg.tokens}
          </AppText>
        </View>
        <AppText variant="micro" color={active ? "rgba(255,255,255,0.8)" : colors.textTertiary}>
          {cfg.days} days
        </AppText>
        {cfg.extends_active ? (
          <View style={[styles.tierTag, { backgroundColor: active ? "rgba(255,255,255,0.22)" : colors.successSoft }]}>
            <AppText variant="micro" color={active ? "#fff" : colors.success}>
              Live
            </AppText>
          </View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

/* ─── Phone-frame preview with per-placement mock screens ───────────────── */
function PhonePreview({ placement, tier, preview }: { placement: Placement; tier: PromotionTier; preview: PromotionPreview }) {
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const frameW = Math.min(width - space[4] * 2, 420);
  const frameH = Math.round(frameW * 0.78);
  const p = preview.property;
  const label = TIER_META[tier].label;
  return (
    <View style={[styles.frame, { width: frameW, height: frameH, backgroundColor: colors.surfaceInverse }, shadows.md]} testID={`preview-${placement}`}>
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Animated.View key={`${placement}-${tier}`} entering={FadeIn.duration(220)} style={{ flex: 1 }}>
          {placement === "results" ? <ResultsMock p={p} label={label} /> : placement === "featured" ? <FeaturedMock p={p} label={label} /> : placement === "map" ? <MapMock p={p} /> : <AlertsMock p={p} buyers={preview.reach.matched_buyers} />}
        </Animated.View>
      </View>
      <View style={styles.notch} />
    </View>
  );
}

function MockBar({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.mockBar}>
      <AmassLogo size={16} showWordmark={false} />
      <AppText variant="micro" weight="bold" color={colors.text} style={{ flex: 1 }}>
        {title}
      </AppText>
      <View style={[styles.mockDot, { backgroundColor: colors.surfaceAlt }]} />
    </View>
  );
}

function GhostRow({ compact }: { compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.ghostRow, { backgroundColor: colors.surfaceAlt }]}>
      <View style={[styles.ghostImg, compact && { width: 34, height: 34 }, { backgroundColor: colors.skeleton }]} />
      <View style={{ flex: 1, gap: 5 }}>
        <View style={[styles.ghostLine, { width: "70%", backgroundColor: colors.skeleton }]} />
        <View style={[styles.ghostLine, { width: "45%", backgroundColor: colors.skeleton }]} />
      </View>
    </View>
  );
}

function ResultsMock({ p, label }: { p: PromotionPreview["property"]; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, gap: 8 }}>
      <MockBar title={`Homes in ${p.city || "your area"}`} />
      <View style={[styles.heroRow, { borderColor: GOLD, backgroundColor: colors.surface }]} testID="mock-hero-row">
        <Image source={{ uri: p.image ?? undefined }} style={[styles.heroImg, { backgroundColor: colors.skeleton }]} contentFit="cover" />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={[styles.goldTag, { backgroundColor: GOLD }]}>
            <Ionicons name="trending-up" size={9} color="#111" />
            <AppText variant="micro" color="#111" style={{ fontSize: 9, lineHeight: 11 }}>
              {label}
            </AppText>
          </View>
          <AppText variant="micro" weight="bold" color={colors.text} numberOfLines={1}>
            {p.title}
          </AppText>
          <AppText variant="micro" color={colors.textTertiary} numberOfLines={1}>
            {formatMarkerPrice(p.price ?? 0, p.listing_type ?? "buy")} · {p.location}
          </AppText>
        </View>
      </View>
      <GhostRow />
      <GhostRow />
    </View>
  );
}

function FeaturedMock({ p, label }: { p: PromotionPreview["property"]; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, gap: 8 }}>
      <MockBar title="Search results" />
      <View style={{ gap: 2 }}>
        <AppText variant="caption" weight="bold" color={colors.text}>
          Featured homes
        </AppText>
        <AppText variant="micro" color={colors.textTertiary}>
          Gold badge · first in every results list
        </AppText>
      </View>
      <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
        <View style={[styles.featCard, { backgroundColor: colors.surface, borderColor: GOLD }]} testID="mock-featured-card">
          <Image source={{ uri: p.image ?? undefined }} style={[styles.featImg, { backgroundColor: colors.skeleton }]} contentFit="cover" />
          <View style={[styles.goldTag, styles.featTag, { backgroundColor: GOLD }]}>
            <Ionicons name="star" size={9} color="#111" />
            <AppText variant="micro" color="#111" style={{ fontSize: 9, lineHeight: 11 }}>
              {label}
            </AppText>
          </View>
          <View style={{ padding: 6, gap: 2 }}>
            <AppText variant="micro" weight="bold" color={colors.text} numberOfLines={1}>
              {p.title}
            </AppText>
            <AppText variant="micro" color={colors.textTertiary} numberOfLines={1}>
              {formatMarkerPrice(p.price ?? 0, p.listing_type ?? "buy")}
            </AppText>
          </View>
        </View>
        <View style={[styles.featCard, { backgroundColor: colors.surfaceAlt, borderColor: "transparent" }]}>
          <View style={[styles.featImg, { backgroundColor: colors.skeleton }]} />
          <View style={{ padding: 6, gap: 5 }}>
            <View style={[styles.ghostLine, { width: "80%", backgroundColor: colors.skeleton }]} />
            <View style={[styles.ghostLine, { width: "40%", backgroundColor: colors.skeleton }]} />
          </View>
        </View>
        <View style={[styles.featCard, { backgroundColor: colors.surfaceAlt, borderColor: "transparent", width: 40, flexGrow: 0 }]}>
          <View style={[styles.featImg, { backgroundColor: colors.skeleton }]} />
        </View>
      </View>
    </View>
  );
}

function MapMock({ p }: { p: PromotionPreview["property"] }) {
  const { colors } = useTheme();
  const ghost = [
    { left: "14%", top: "28%" },
    { left: "62%", top: "22%" },
    { left: "72%", top: "66%" },
    { left: "22%", top: "70%" },
  ] as const;
  return (
    <View style={[styles.map, { backgroundColor: colors.surfaceAlt }]} testID="mock-map">
      {/* faint roads */}
      <View style={[styles.road, { top: "38%", transform: [{ rotate: "-8deg" }], backgroundColor: colors.bg }]} />
      <View style={[styles.road, { top: "72%", transform: [{ rotate: "6deg" }], backgroundColor: colors.bg }]} />
      <View style={[styles.roadV, { left: "48%", transform: [{ rotate: "12deg" }], backgroundColor: colors.bg }]} />
      {ghost.map((g, i) => (
        <View key={i} style={[styles.ghostPin, { left: g.left, top: g.top, backgroundColor: colors.borderStrong }]} />
      ))}
      <View style={[styles.boostPinWrap, { left: "40%", top: "36%" }]} testID="mock-boost-pin">
        <View style={[styles.boostPin, { borderColor: GOLD }]}>
          <Image source={{ uri: p.image ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
        </View>
        <View style={[styles.boostPinTail, { borderTopColor: GOLD }]} />
        <View style={[styles.goldTag, { backgroundColor: GOLD, marginTop: 4 }]}>
          <Ionicons name="rocket" size={9} color="#111" />
          <AppText variant="micro" color="#111" style={{ fontSize: 9, lineHeight: 11 }}>
            Boosted · {formatMarkerPrice(p.price ?? 0, p.listing_type ?? "buy")}
          </AppText>
        </View>
      </View>
      <View style={[styles.mapKey, { backgroundColor: colors.bgElevated }]}>
        <View style={[styles.keyDot, { borderColor: GOLD }]} />
        <AppText variant="micro" color={colors.text}>
          Gold ring = boosted
        </AppText>
      </View>
    </View>
  );
}

function AlertsMock({ p, buyers }: { p: PromotionPreview["property"]; buyers: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, gap: 8 }}>
      <MockBar title="Notifications" />
      <View style={[styles.notif, { backgroundColor: colors.surface, borderColor: GOLD }]} testID="mock-alert">
        <View style={[styles.notifIcon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="rocket" size={14} color={colors.brand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="micro" weight="bold" color={colors.text} numberOfLines={1}>
            Just boosted: {p.title}
          </AppText>
          <AppText variant="micro" color={colors.textTertiary} numberOfLines={2}>
            {formatMarkerPrice(p.price ?? 0, p.listing_type ?? "buy")} · {p.city || p.location} — matches “{p.bedrooms ? `${p.bedrooms}-bed in ${p.city || "Lagos"}` : "your saved search"}”
          </AppText>
        </View>
        <View style={[styles.newDot, { backgroundColor: colors.brand }]} />
      </View>
      <GhostRow compact />
      <View style={[styles.alertNote, { backgroundColor: colors.massSoft }]}>
        <Ionicons name="people" size={14} color={colors.massText} />
        <AppText variant="micro" color={colors.massText} style={{ flex: 1 }}>
          {buyers > 0 ? `${buyers} buyer${buyers === 1 ? "" : "s"} with a matching saved search get this once — plus a phone alert if they've turned alerts on.` : "No saved searches match yet — new matching searches still find you first in results."}
        </AppText>
      </View>
    </View>
  );
}

/* ─── Success ───────────────────────────────────────────────────────────── */
function SuccessPanel({ result, preview, onViewListing, onMap, onDone }: { result: NonNullable<Awaited<ReturnType<typeof api.promoteListing>>>; preview: PromotionPreview; onViewListing: () => void; onMap: () => void; onDone: () => void }) {
  const { colors } = useTheme();
  const m = TIER_META[result.tier];
  const cfg = preview.tiers[result.tier];
  const until = result.expires_at ? new Date(result.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
  return (
    <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="boost-success">
      <LinearGradient colors={[...m.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.successHero}>
        <Gloss />
        <View style={styles.successIcon}>
          <Ionicons name={m.icon} size={30} color="#fff" />
        </View>
        <AppText variant="h2" color="#fff" align="center">
          {cfg.label} is live
        </AppText>
        <AppText variant="bodySm" color="rgba(255,255,255,0.86)" align="center">
          {preview.property.title}
          {"\n"}
          {result.extended ? "Extended" : "Running"} until {until} · {result.cost.toLocaleString()} MASS charged
        </AppText>
        {result.tier === "boost" ? (
          <View style={styles.successPill}>
            <Ionicons name="notifications" size={12} color="#fff" />
            <AppText variant="caption" color="#fff" tabular>
              {result.alerts_sent} buyer{result.alerts_sent === 1 ? "" : "s"} alerted
            </AppText>
          </View>
        ) : null}
      </LinearGradient>
      <Card tone="soft" style={{ gap: 10 }}>
        <AppText variant="title">See it live</AppText>
        <Button label="Open the map" variant="secondary" iconLeft="map-outline" fullWidth onPress={onMap} testID="success-map" />
        <Button label="View listing" variant="secondary" iconLeft="home-outline" fullWidth onPress={onViewListing} testID="success-listing" />
      </Card>
      <AppText variant="caption" tone="tertiary" align="center">
        New balance: {result.balance_after.toLocaleString()} MASS · receipt saved to your wallet history.
      </AppText>
      <Button label="Done" variant="primary" size="lg" fullWidth onPress={onDone} testID="success-done" style={{ marginTop: 4 }} />
      <View style={{ height: 2, width: 1, backgroundColor: colors.bg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listingRow: { flexDirection: "row", gap: 12, padding: 12, alignItems: "center" },
  listingImg: { width: 64, height: 64, borderRadius: radii.md },
  activeBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg, overflow: "hidden" },
  tiersRow: { flexDirection: "row", gap: 10 },
  tier: { borderRadius: radii.lg, padding: 12, alignItems: "center", gap: 4, minHeight: 128, justifyContent: "center", overflow: "hidden" },
  tierIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  tierTag: { position: "absolute", top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill },
  perk: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radii.md },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  placementRow: { flexDirection: "row", gap: 6 },
  placementChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, height: 34, borderRadius: radii.pill, paddingHorizontal: 6 },
  frame: { alignSelf: "center", borderRadius: 26, padding: 8, overflow: "hidden" },
  screen: { flex: 1, borderRadius: 20, overflow: "hidden" },
  notch: { position: "absolute", top: 8, alignSelf: "center", width: 70, height: 14, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: "#111111" },
  mockBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 12, paddingBottom: 2 },
  mockDot: { width: 18, height: 18, borderRadius: 9 },
  ghostRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: radii.md },
  ghostImg: { width: 44, height: 44, borderRadius: radii.sm },
  ghostLine: { height: 7, borderRadius: 4 },
  heroRow: { flexDirection: "row", gap: 8, padding: 8, borderRadius: radii.md, borderWidth: 1.5, alignItems: "center" },
  heroImg: { width: 56, height: 56, borderRadius: radii.sm },
  goldTag: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill },
  featCard: { flex: 1, borderRadius: radii.md, overflow: "hidden", borderWidth: 1.5 },
  featImg: { width: "100%", height: 64 },
  featTag: { position: "absolute", top: 6, left: 6 },
  map: { flex: 1, overflow: "hidden" },
  road: { position: "absolute", left: -20, right: -20, height: 10, borderRadius: 5 },
  roadV: { position: "absolute", top: -20, bottom: -20, width: 10, borderRadius: 5 },
  ghostPin: { position: "absolute", width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)" },
  boostPinWrap: { position: "absolute", alignItems: "center" },
  boostPin: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, overflow: "hidden", backgroundColor: "#fff" },
  boostPinTail: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
  mapKey: { position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, height: 24, borderRadius: radii.pill },
  keyDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  notif: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: radii.md, borderWidth: 1.5 },
  notifIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  newDot: { width: 8, height: 8, borderRadius: 4 },
  alertNote: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: radii.sm },
  statsRow: { flexDirection: "row", gap: space[3] },
  includeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  successHero: { borderRadius: radii.xl, padding: space[6], alignItems: "center", gap: 10, overflow: "hidden" },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  successPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.16)" },
});
