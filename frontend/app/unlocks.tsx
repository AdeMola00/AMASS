import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, Property } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, EmptyState, Screen, ScreenHeader, Sheet, SkeletonCard, useToast } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";

type Entitlement = {
  id: string;
  status: "active" | "refunded" | "revoked" | "pending";
  amount_paid: number;
  currency: "MASS" | "FIX";
  created_at: string;
  refund_reason?: string | null;
  source?: string;
};
type Item = { entitlement: Entitlement; property?: Property };

const CREDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export default function UnlocksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { refresh } = useWallet();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "sale" | "rent">("all");
  const [report, setReport] = useState<Item | null>(null);
  const [reason, setReason] = useState<"unavailable" | "unreachable">("unavailable");
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await api.myUnlocks("property");
      setItems(res.items.filter((it) => it.property) as Item[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((it) => {
      const lt = (it.property?.listing_type || "").toLowerCase();
      const isSale = lt === "sale" || lt === "buy";
      return filter === "sale" ? isSale : !isSale;
    });
  }, [items, filter]);

  const totalSpent = useMemo(() => items.filter((i) => i.entitlement.status === "active").reduce((s, i) => s + (i.entitlement.amount_paid || 0), 0), [items]);

  const submitReport = async () => {
    if (!report || reporting) return;
    setReporting(true);
    try {
      const res = await api.reportUnlock(report.entitlement.id, reason);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Credit issued", `${res.credited} ${res.currency} is back in your wallet.`);
      setReport(null);
      refresh().catch(() => {});
      load();
    } catch (e: any) {
      toast.error("Couldn't issue a credit", e?.message ?? "Please try again or contact support.");
    } finally {
      setReporting(false);
    }
  };

  return (
    <Screen testID="unlocks-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My unlocks" subtitle={items.length ? `${items.length} unlocked · ${totalSpent.toLocaleString()} MASS spent · yours forever` : undefined} />

      {loading ? (
        <View style={{ padding: space[4], gap: space[3] }}>
          <SkeletonCard imageHeight={160} />
          <SkeletonCard imageHeight={160} />
        </View>
      ) : error ? (
        <EmptyState
          variant="error"
          title="Couldn't load unlocks"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            setLoading(true);
            load();
          }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="lock-open-outline"
          title="No unlocked properties yet"
          body="Tap any pin on the map to unlock a property — the exact address, every photo and the agent's contact stay here forever."
          actionLabel="Explore the map"
          onAction={() => router.replace("/(tabs)" as any)}
          testID="unlocks-empty"
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.text}
            />
          }
        >
          <View style={styles.filters}>
            <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} count={items.length} testID="unlocks-filter-all" />
            <Chip label="For sale" icon="pricetag-outline" selected={filter === "sale"} onPress={() => setFilter("sale")} testID="unlocks-filter-sale" />
            <Chip label="To rent" icon="key-outline" selected={filter === "rent"} onPress={() => setFilter("rent")} testID="unlocks-filter-rent" />
          </View>

          {visible.map((it) => (
            <UnlockCard key={it.entitlement.id} item={it} onOpen={() => router.push(`/property/${it.property!.id}` as any)} onReport={() => setReport(it)} />
          ))}
        </ScrollView>
      )}

      <Sheet visible={!!report} onClose={() => !reporting && setReport(null)} title="Request a credit" testID="unlock-report-sheet">
        <AppText variant="bodySm" tone="secondary">
          Within 24 hours of unlocking, we credit the full fee back to your wallet if the listing turned out to be unavailable or the agent could not be reached.
        </AppText>
        <View style={{ gap: 10, marginTop: space[4] }}>
          <ReasonRow
            icon="home-outline"
            title="Listing is no longer available"
            body="Sold, rented or withdrawn since I paid."
            selected={reason === "unavailable"}
            onPress={() => setReason("unavailable")}
            testID="report-reason-unavailable"
          />
          <ReasonRow
            icon="call-outline"
            title="Agent is unreachable"
            body="Number doesn't connect and no reply in chat."
            selected={reason === "unreachable"}
            onPress={() => setReason("unreachable")}
            testID="report-reason-unreachable"
          />
        </View>
        <View style={styles.sheetActions}>
          <Button label="Not now" variant="secondary" size="lg" onPress={() => setReport(null)} disabled={reporting} style={{ flex: 1 }} testID="report-cancel" />
          <Button
            label={report ? `Credit ${report.entitlement.amount_paid} MASS` : "Credit"}
            variant="primary"
            size="lg"
            iconLeft="refresh-circle"
            onPress={submitReport}
            loading={reporting}
            disabled={reporting}
            style={{ flex: 1.3 }}
            testID="report-confirm"
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function UnlockCard({ item, onOpen, onReport }: { item: Item; onOpen: () => void; onReport: () => void }) {
  const { colors } = useTheme();
  const p = item.property!;
  const e = item.entitlement;
  const paid = e.amount_paid > 0;
  const ageMs = Date.now() - new Date(e.created_at).getTime();
  const canCredit = e.status === "active" && paid && ageMs >= 0 && ageMs < CREDIT_WINDOW_MS;
  const hoursLeft = Math.max(0, Math.ceil((CREDIT_WINDOW_MS - ageMs) / 3_600_000));
  const refunded = e.status === "refunded";
  const sale = (p.listing_type as string) === "sale" || p.listing_type === "buy";
  return (
    <Card elevation="sm" padded={false} testID={`unlock-${e.id}`}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${p.title}, ${refunded ? "credited" : "unlocked"}. Open details`} style={({ pressed }) => pressed && { opacity: 0.92 }}>
        <Image source={{ uri: p.images?.[0] }} style={[styles.image, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={250} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>
              {p.title}
            </AppText>
            {refunded ? <Badge label="Credited" tone="warning" icon="refresh-circle" size="xs" /> : <Badge label="Unlocked" tone="success" icon="lock-open" size="xs" />}
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location" size={12} color={colors.brand} />
            <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
              {p.location}
            </AppText>
            <Badge label={sale ? "Sale" : "Rent"} tone="neutral" size="xs" />
          </View>
          <AppText variant="h3" tabular>
            {formatNaira(p.price)}
            {!sale ? <AppText variant="caption" tone="tertiary">{p.listing_type === "shortlet" ? " /night" : " /year"}</AppText> : null}
          </AppText>
          <View style={styles.metaRow}>
            <TokenIcon size={12} />
            <AppText variant="micro" tone="tertiary" tabular>
              {paid ? `${e.amount_paid.toLocaleString()} MASS` : e.source === "owner" ? "Your listing" : "Free"} · {new Date(e.created_at).toLocaleDateString()}
              {refunded ? ` · credited back` : ""}
            </AppText>
          </View>
        </View>
      </Pressable>
      {canCredit ? (
        <View style={{ paddingHorizontal: space[3], paddingBottom: space[3] }}>
          <Button
            label={`Listing unavailable? Get a credit · ${hoursLeft}h left`}
            variant="ghost"
            size="sm"
            iconLeft="shield-checkmark-outline"
            onPress={onReport}
            style={{ alignSelf: "flex-start" }}
            testID={`unlock-report-${e.id}`}
          />
        </View>
      ) : null}
    </Card>
  );
}

function ReasonRow({ icon, title, body, selected, onPress, testID }: { icon: any; title: string; body: string; selected: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Card
      onPress={onPress}
      elevation="none"
      style={[styles.reason, { borderColor: selected ? colors.brand : colors.border, backgroundColor: selected ? colors.brandSoft : colors.surface }]}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Ionicons name={icon} size={20} color={selected ? colors.brand : colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyMedium" weight="semibold">
          {title}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {body}
        </AppText>
      </View>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.brand : colors.textTertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  image: { width: "100%", height: 170, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  body: { padding: space[4], gap: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: space[4] },
  reason: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, padding: space[3] },
});
