import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, Neighborhood, Property } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, BalanceChip, Card, EmptyState, IconButton, ProgressBar, Screen, Section, Skeleton, SkeletonCard, type IconName } from "@/src/ui";
import { ListingCard } from "@/src/components/ListingCard";
import { getRecentlyViewedIds } from "@/src/lib/recently-viewed";
import { AmassPinIcon } from "@/src/components/AmassLogo";

type Category = { key: string; label: string; caption: string; icon: IconName; tone: "default" | "brand" | "fix" | "mass" | "info" | "premium"; route: string };

const CATEGORIES: Category[] = [
  { key: "buy", label: "Buy", caption: "Homes & land for sale", icon: "home", tone: "brand", route: `/(tabs)?ai_filters=${encodeURIComponent(JSON.stringify({ listing_type: "buy" }))}` },
  { key: "rent", label: "Rent", caption: "Yearly & shortlet", icon: "key", tone: "info", route: `/(tabs)?ai_filters=${encodeURIComponent(JSON.stringify({ listing_type: "rent" }))}` },
  { key: "services", label: "Services", caption: "FIXA verified pros", icon: "construct", tone: "fix", route: "/fixa" },
  { key: "brands", label: "Brands", caption: "Stores & products", icon: "storefront", tone: "mass", route: "/(tabs)/marketplace" },
  { key: "declutter", label: "Declutter", caption: "Sell or clear a home", icon: "cube", tone: "premium", route: "/marketplace/sell" },
  { key: "improve", label: "Improve", caption: "Inspect · Finance · Renovate", icon: "hammer", tone: "default", route: "/improve" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Discover() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [featured, setFeatured] = useState<Property[]>([]);
  const [recent, setRecent] = useState<Property[]>([]);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [nb, props, favs] = await Promise.all([
        api.neighborhoods().catch(() => [] as Neighborhood[]),
        api.listProperties({ verified: true }).catch(() => [] as Property[]),
        api.favoriteIds().catch(() => ({ ids: [] as string[] })),
      ]);
      setNeighborhoods(nb);
      const list = props.length ? props : await api.listProperties().catch(() => [] as Property[]);
      setFeatured(list.filter((p) => p.status !== "sold").slice(0, 8));
      setFavIds(new Set(favs.ids));
      if (!nb.length && !list.length) setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
    api.notifications().then((r) => setUnread(r.unread ?? 0)).catch(() => {});
  }, []);

  const loadRecent = useCallback(async () => {
    const ids = await getRecentlyViewedIds();
    if (!ids.length) return setRecent([]);
    const items = await Promise.all(ids.slice(0, 6).map((id) => api.getProperty(id).catch(() => null)));
    setRecent(items.filter(Boolean) as Property[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      loadRecent();
    }, [loadRecent])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadRecent()]);
    setRefreshing(false);
  };

  const trending = useMemo(() => neighborhoods.filter((n) => n.trending), [neighborhoods]);
  const movers = useMemo(() => [...neighborhoods].sort((a, b) => (b.price_change_pct ?? 0) - (a.price_change_pct ?? 0)).slice(0, 4), [neighborhoods]);
  const firstName = user?.full_name?.split(" ")[0];
  const tileW = (Math.min(width, 560) - space[4] * 2 - space[3] * 2) / 3;

  return (
    <Screen testID="discover-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140, gap: space[6] }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" tone="tertiary">
                {greeting()}
                {firstName ? "," : ""}
              </AppText>
              <AppText variant="h1" numberOfLines={1}>
                {firstName ?? "Welcome"}
              </AppText>
            </View>
            <BalanceChip />
            <IconButton icon="notifications-outline" label="Notifications" badge={unread} onPress={() => router.push("/notifications")} testID="discover-notifications" />
          </View>

          <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.md]}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                router.push("/ai-search");
              }}
              accessibilityRole="search"
              accessibilityLabel="Search properties with AI"
              testID="discover-search"
              style={({ pressed }) => [styles.searchMain, pressed && { opacity: 0.8 }]}
            >
              <View style={[styles.searchIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="sparkles" size={16} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium">Where to next?</AppText>
                <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                  Try “3-bed in Lekki under ₦150M”
                </AppText>
              </View>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)" as any)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open map"
              testID="discover-open-map"
              style={[styles.mapBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="map" size={16} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>

        {/* Category entry points */}
        <View style={styles.tiles}>
          {CATEGORIES.map((c) => (
            <CategoryTile key={c.key} c={c} width={tileW} onPress={() => router.push(c.route as any)} />
          ))}
        </View>

        {/* Featured */}
        <Section title="Featured homes" caption="Verified listings, hand-checked by AMASS" actionLabel="See map" onAction={() => router.push("/(tabs)" as any)}>
          {loading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll} contentContainerStyle={styles.rail}>
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} style={{ width: 268 }} />
              ))}
            </ScrollView>
          ) : featured.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll} contentContainerStyle={styles.rail} testID="featured-rail">
              {featured.map((p) => (
                <ListingCard key={p.id} property={p} saved={favIds.has(p.id)} onToggleSave={(id, next) => setFavIds((s) => {
                  const n = new Set(s);
                  if (next) n.add(id); else n.delete(id);
                  return n;
                })} />
              ))}
            </ScrollView>
          ) : (
            <EmptyState compact icon="home-outline" title="No featured homes yet" body="New verified listings land here as agents publish them." actionLabel="Browse map" onAction={() => router.push("/(tabs)" as any)} variant={error ? "error" : "empty"} />
          )}
        </Section>

        {/* Recently viewed */}
        {recent.length ? (
          <Section title="Pick up where you left off" caption="Recently viewed" testID="recent-section">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll} contentContainerStyle={styles.rail}>
              {recent.map((p) => (
                <ListingCard key={p.id} property={p} width={200} compact saved={favIds.has(p.id)} testID={`recent-card-${p.id}`} />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {/* Trending areas */}
        <Section title="Trending areas" caption="Fastest-appreciating neighbourhoods">
          {loading ? (
            <View style={styles.rail}>
              <Skeleton width={240} height={200} radius={radii.lg} />
            </View>
          ) : trending.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll} contentContainerStyle={styles.rail}>
              {trending.map((n) => (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${n.name}, average ${formatNaira(n.avg_price)}, up ${n.price_change_pct}%`}
                  onPress={() => router.push(`/(tabs)?ai_filters=${encodeURIComponent(JSON.stringify({ city: n.name }))}` as any)}
                  style={({ pressed }) => [styles.trend, shadows.sm, pressed && { opacity: 0.92 }]}
                  testID={`trend-${n.id}`}
                >
                  <Image source={{ uri: n.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.38)" }]} />
                  <View style={[styles.trendBadge, { backgroundColor: colors.success }]}>
                    <Ionicons name="trending-up" size={11} color="#fff" />
                    <AppText variant="micro" color="#fff" tabular>
                      +{n.price_change_pct}%
                    </AppText>
                  </View>
                  <View style={styles.trendBody}>
                    <AppText variant="h3" color="#fff">
                      {n.name}
                    </AppText>
                    <AppText variant="caption" color="rgba(255,255,255,0.8)" tabular>
                      Avg {formatNaira(n.avg_price)} · {n.state}
                    </AppText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <EmptyState compact icon="trending-up-outline" title="Market data coming soon" body="Neighbourhood trends appear once we have enough signals." />
          )}
        </Section>

        {/* Neighborhood scores */}
        {neighborhoods.length ? (
          <Section title="Neighbourhood scores" caption="Livability index · walk, schools, safety, infrastructure">
            <View style={{ gap: space[3] }}>
              {neighborhoods.slice(0, 5).map((n) => (
                <ScoreCard key={n.id} n={n} />
              ))}
            </View>
          </Section>
        ) : null}

        {/* Market movers — derived from real neighbourhood data */}
        {movers.length ? (
          <Section title="Market movers" caption="Year-on-year price change">
            <Card padded={false}>
              {movers.map((n, i) => {
                const up = (n.price_change_pct ?? 0) >= 0;
                return (
                  <View key={n.id} style={[styles.mover, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }]}>
                    <View style={[styles.moverIcon, { backgroundColor: up ? colors.successSoft : colors.errorSoft }]}>
                      <Ionicons name={up ? "trending-up" : "trending-down"} size={16} color={up ? colors.success : colors.error} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyMedium">{n.name}</AppText>
                      <AppText variant="caption" tone="tertiary" tabular>
                        Avg {formatNaira(n.avg_price)}
                      </AppText>
                    </View>
                    <AppText variant="title" tabular color={up ? colors.success : colors.error}>
                      {up ? "+" : ""}
                      {n.price_change_pct}%
                    </AppText>
                  </View>
                );
              })}
            </Card>
          </Section>
        ) : null}

        {/* Journey nudges — connect services to the property journey */}
        <Section title="Prepare your home" caption="Everything around the move, in one place">
          <View style={{ gap: space[3] }}>
            <JourneyCard
              icon="cube-outline"
              tone="premium"
              title="Preparing to sell? Declutter first"
              body="Clear and organise before photos — list items you no longer need."
              cta="Start decluttering"
              onPress={() => router.push("/marketplace/sell" as any)}
              testID="journey-declutter"
            />
            <JourneyCard
              icon="search-circle-outline"
              tone="info"
              title="Need an inspection?"
              body="Book a verified inspector before you commit to a purchase."
              cta="Book inspection"
              onPress={() => router.push("/improve" as any)}
              testID="journey-inspection"
            />
          </View>
        </Section>

        <View style={styles.footer}>
          <AmassPinIcon size={18} />
          <AppText variant="caption" tone="muted">
            AMASS · Africa&apos;s property operating system
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

function CategoryTile({ c, width, onPress }: { c: Category; width: number; onPress: () => void }) {
  const { colors, shadows } = useTheme();
  const tone = {
    default: { bg: colors.surfaceAlt, fg: colors.text },
    brand: { bg: colors.brandSoft, fg: colors.brand },
    fix: { bg: colors.fixSoft, fg: colors.fixText },
    mass: { bg: colors.massSoft, fg: colors.massText },
    info: { bg: colors.infoSoft, fg: colors.info },
    premium: { bg: colors.premiumSoft, fg: colors.premium },
  }[c.tone];
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${c.label}: ${c.caption}`}
      testID={`category-${c.key}`}
      style={({ pressed }) => [styles.tile, { width, backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <View style={[styles.tileIcon, { backgroundColor: tone.bg }]}>
        <Ionicons name={c.icon} size={20} color={tone.fg} />
      </View>
      <AppText variant="bodyMedium" numberOfLines={1}>
        {c.label}
      </AppText>
      <AppText variant="micro" tone="tertiary" numberOfLines={2} style={{ letterSpacing: 0 }}>
        {c.caption}
      </AppText>
    </Pressable>
  );
}

function ScoreCard({ n }: { n: Neighborhood }) {
  const { colors } = useTheme();
  const metrics = [
    { label: "Walk", value: n.walk_score },
    { label: "Schools", value: n.school_score },
    { label: "Safety", value: n.safety_score },
    { label: "Infra", value: n.infrastructure_score },
  ];
  const scoreTone = n.overall_score >= 85 ? colors.success : n.overall_score >= 70 ? colors.warning : colors.textSecondary;
  return (
    <Card testID={`score-${n.id}`}>
      <View style={styles.scoreHead}>
        <View style={{ flex: 1 }}>
          <AppText variant="title">{n.name}</AppText>
          <AppText variant="caption" tone="tertiary">
            {n.city}, {n.state}
          </AppText>
        </View>
        <View style={[styles.scoreRing, { borderColor: scoreTone }]} accessibilityLabel={`Overall score ${n.overall_score}`}>
          <AppText variant="h3" tabular>
            {n.overall_score}
          </AppText>
          <AppText variant="micro" tone="tertiary">
            SCORE
          </AppText>
        </View>
      </View>
      <View style={styles.metrics}>
        {metrics.map((m) => (
          <View key={m.label} style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <AppText variant="micro" tone="tertiary">
                {m.label.toUpperCase()}
              </AppText>
              <AppText variant="micro" tabular>
                {m.value}
              </AppText>
            </View>
            <ProgressBar value={m.value / 100} height={4} tone={m.value >= 85 ? "success" : m.value >= 70 ? "warning" : "primary"} />
          </View>
        ))}
      </View>
    </Card>
  );
}

function JourneyCard({ icon, tone, title, body, cta, onPress, testID }: { icon: IconName; tone: "premium" | "info"; title: string; body: string; cta: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  const t = tone === "premium" ? { bg: colors.premiumSoft, fg: colors.premium } : { bg: colors.infoSoft, fg: colors.info };
  return (
    <Card onPress={onPress} testID={testID}>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <View style={[styles.journeyIcon, { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={22} color={t.fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">{title}</AppText>
          <AppText variant="caption" tone="tertiary">
            {body}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 4 }}>
            <AppText variant="caption" weight="bold" color={t.fg}>
              {cta}
            </AppText>
            <Ionicons name="arrow-forward" size={12} color={t.fg} />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space[4], paddingTop: space[2], gap: space[4] },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, paddingLeft: 12, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, minHeight: 60 },
  searchMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  searchIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  mapBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space[3], paddingHorizontal: space[4] },
  tile: { padding: 12, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, gap: 6, minHeight: 112 },
  tileIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  railScroll: { marginHorizontal: -space[4] },
  rail: { gap: space[3], paddingHorizontal: space[4] },
  trend: { width: 240, height: 200, borderRadius: radii.lg, overflow: "hidden", justifyContent: "flex-end" },
  trendBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 22, borderRadius: radii.pill },
  trendBody: { padding: 14, gap: 2 },
  scoreHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  scoreRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  metrics: { flexDirection: "row", gap: 12 },
  mover: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  moverIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  journeyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  footer: { alignItems: "center", gap: 6, paddingTop: space[2] },
});
