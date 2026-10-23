import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError, ProviderPreview } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { Appear, AppText, Badge, Chip, EmptyState, Input, PressableScale, Screen, ScreenHeader, SkeletonRows } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { FixaGate } from "@/src/components/fixa/FixaGate";

const TIER_META: Record<number, { label: string; icon: IconName }> = {
  1: { label: "Everyday help", icon: "hand-left-outline" },
  2: { label: "Skilled trade", icon: "build-outline" },
  3: { label: "Project", icon: "hammer-outline" },
  4: { label: "Professional", icon: "ribbon-outline" },
};

export default function FixaBrowse() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { fix, refresh } = useWallet();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [balance, setBalance] = useState(0);
  const [items, setItems] = useState<ProviderPreview[]>([]);
  const [subs, setSubs] = useState<string[]>([]);
  const [sub, setSub] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const access = await api.fixaAccess();
      setBalance(access.balance);
      setAllowed(access.allowed);
      if (!access.allowed) {
        setItems([]);
        return;
      }
      const res = await api.fixaProviders({ q: query.trim() || undefined, subcategory: sub ?? undefined, verified: verifiedOnly || undefined, limit: 80 });
      setItems(res.items);
      setSubs(res.subcategories);
      if (typeof res.fix_balance === "number") setBalance(res.fix_balance);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 403) {
        setAllowed(false);
        setItems([]);
      } else {
        setError(e?.message ?? "Couldn't load FIXA providers.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, sub, verifiedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // Balance changes (top-up / unlock) → re-evaluate the gate without a manual refresh.
  useEffect(() => {
    if (fix && allowed === false && (fix.spendable ?? 0) > 0) load();
  }, [fix, allowed, load]);

  const subtitle = useMemo(() => (allowed ? `${items.length} vetted pros · ${balance.toLocaleString()} FIX` : "Verified home-service pros"), [allowed, items.length, balance]);

  return (
    <Screen testID="fixa-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="FIXA" subtitle={subtitle} right={<FixBalancePill balance={balance} onPress={() => router.push("/wallet" as any)} />} />

      {loading && allowed === null ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={6} />
        </View>
      ) : allowed === false ? (
        <FixaGate balance={balance} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 40 + insets.bottom, gap: space[3] }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                refresh().catch(() => {});
                load();
              }}
              tintColor={colors.text}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: space[3] }}>
              <Input placeholder="Search a trade, name or area" value={query} onChangeText={setQuery} iconLeft="search" returnKeyType="search" onSubmitEditing={load} testID="fixa-search" />
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={["__verified", ...subs]}
                keyExtractor={(s) => s}
                contentContainerStyle={{ gap: 8 }}
                renderItem={({ item: s }) =>
                  s === "__verified" ? (
                    <Chip label="FIXA verified" icon="shield-checkmark" selected={verifiedOnly} tone="fix" onPress={() => setVerifiedOnly((v) => !v)} testID="fixa-chip-verified" />
                  ) : (
                    <Chip label={s} selected={sub === s} onPress={() => setSub(sub === s ? null : s)} testID={`fixa-sub-${s.toLowerCase().replace(/\s+/g, "-")}`} />
                  )
                }
              />
              <View style={[styles.note, { backgroundColor: colors.fixSoft }]} accessibilityRole="summary">
                <Ionicons name="information-circle" size={15} color={colors.fixText} />
                <AppText variant="caption" color={colors.fixText} style={{ flex: 1 }}>
                  Browsing is free. Direct contact is unlocked per provider with FIX — one-time, yours forever.
                </AppText>
              </View>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <SkeletonRows rows={5} />
            ) : error ? (
              <EmptyState variant="error" title={error} body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="fixa-error" />
            ) : (
              <EmptyState
                icon="construct-outline"
                title="No pros match"
                body="Try another trade or clear the search."
                actionLabel="Clear filters"
                onAction={() => {
                  setSub(null);
                  setQuery("");
                  setVerifiedOnly(false);
                }}
                testID="fixa-empty"
              />
            )
          }
          renderItem={({ item, index }) => (
            <Appear index={index}>
              <ProviderRow provider={item} onPress={() => router.push(`/fixa/${item.id}` as any)} />
            </Appear>
          )}
        />
      )}
    </Screen>
  );
}

function FixBalancePill({ balance, onPress }: { balance: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: colors.fixSoft }]} accessibilityRole="button" accessibilityLabel={`${balance} FIX. Open wallet`} testID="fixa-balance-pill">
      <View style={[styles.pillDot, { backgroundColor: colors.fix }]} />
      <AppText variant="caption" color={colors.fixText} tabular>
        {balance.toLocaleString()} FIX
      </AppText>
    </Pressable>
  );
}

export function ProviderRow({ provider: p, onPress }: { provider: ProviderPreview; onPress: () => void }) {
  const { colors, shadows } = useTheme();
  const tier = TIER_META[p.tier ?? 1] ?? TIER_META[1];
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.row, shadows.xs, { backgroundColor: colors.surface }]}
      accessibilityRole="button"
      accessibilityLabel={`${p.display_name}, ${p.category}${p.rating ? `, rated ${p.rating}` : ""}. ${p.unlocked ? "Contact unlocked" : "Tap to view and unlock contact"}`}
      testID={`fixa-row-${p.id}`}
    >
      <View style={styles.avatarWrap}>
        {p.image ? (
          <Image source={{ uri: p.image }} style={[styles.avatar, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }]}>
            <AppText variant="title" color={colors.textInverse}>
              {p.initials}
            </AppText>
          </View>
        )}
        {p.verified ? (
          <View style={[styles.verifyDot, { backgroundColor: colors.fix, borderColor: colors.surface }]}>
            <Ionicons name="shield-checkmark" size={11} color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>
            {p.display_name}
          </AppText>
          {p.is_boosted ? <Badge label="Boosted" tone="premium" icon="rocket" size="xs" /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Badge label={p.category} tone="neutral" size="xs" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Ionicons name={tier.icon} size={11} color={colors.textTertiary} />
            <AppText variant="micro" tone="tertiary">
              {tier.label}
            </AppText>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {p.rating ? (
            <>
              <Ionicons name="star" size={12} color={colors.mass} />
              <AppText variant="caption" tabular>
                {p.rating.toFixed(1)}
              </AppText>
              <AppText variant="caption" tone="tertiary" tabular>
                ({p.reviews ?? 0})
              </AppText>
            </>
          ) : null}
          {p.area ? (
            <>
              <Ionicons name="location" size={11} color={colors.textTertiary} />
              <AppText variant="caption" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {p.area}
              </AppText>
            </>
          ) : null}
        </View>
      </View>
      <View style={[styles.lockPill, { backgroundColor: p.unlocked ? colors.successSoft : colors.surfaceAlt }]}>
        <Ionicons name={p.unlocked ? "lock-open" : "lock-closed"} size={14} color={p.unlocked ? colors.success : colors.textSecondary} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 32, borderRadius: radii.pill },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.md },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: space[3], borderRadius: radii.lg },
  avatarWrap: { position: "relative" },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  verifyDot: { position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  lockPill: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
