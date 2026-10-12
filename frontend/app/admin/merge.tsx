/**
 * Admin Merge — side-by-side compare, then merge two AMASS IDs.
 * Winner keeps its AMASS ID; loser's ID joins winner.aliases[] so QR codes
 * continue to resolve to the canonical passport.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Sheet, Skeleton, useToast } from "@/src/ui";

type Side = "winner" | "loser";

export default function AdminMergeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ winner?: string; loser?: string }>();

  const [winner, setWinner] = useState(String(params.winner ?? ""));
  const [loser, setLoser] = useState(String(params.loser ?? ""));
  const [compare, setCompare] = useState<{ a: any; b: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!winner || !loser) return;
    setLoading(true);
    setCompareError(null);
    try {
      const c = await api.adminCompareProperties(winner, loser);
      setCompare(c);
    } catch (e: any) {
      setCompareError(e?.message ?? "We couldn't compare these two IDs.");
      setCompare(null);
    } finally {
      setLoading(false);
    }
  }, [winner, loser]);

  useEffect(() => {
    if (winner && loser) load();
  }, [winner, loser, load]);

  const doMerge = async () => {
    if (!compare) return;
    setMerging(true);
    try {
      const res = await api.adminMergeProperties({
        winner_amass_id: winner,
        loser_amass_id: loser,
        reason: reason || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConfirmOpen(false);
      toast.success("Merged", `${res.listings_moved} listing(s) and ${res.reps_moved} representation(s) moved.`);
      router.replace("/admin/duplicate-queue" as any);
    } catch (e: any) {
      toast.error("Merge failed", e?.message ?? "Try again");
    } finally {
      setMerging(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Merge" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to merge properties." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-merge">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Merge properties" subtitle="Winner keeps its AMASS ID" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <Card elevation="xs" style={{ gap: 12 }}>
          <Input
            label="Winner · keeps AMASS ID"
            value={winner}
            onChangeText={setWinner}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="AMASS-LAG-00000001"
            iconLeft="trophy-outline"
            testID="merge-winner"
          />
          <Input
            label="Loser · becomes alias"
            value={loser}
            onChangeText={setLoser}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="AMASS-LAG-00000005"
            iconLeft="git-branch-outline"
            testID="merge-loser"
          />
          <Button label="Compare" iconLeft="git-compare-outline" fullWidth loading={loading} disabled={!winner || !loser} onPress={load} testID="merge-compare" />
        </Card>

        {loading && !compare ? (
          <View style={styles.compareGrid}>
            <Skeleton height={320} radius={radii.lg} style={{ flex: 1 }} />
            <Skeleton height={320} radius={radii.lg} style={{ flex: 1 }} />
          </View>
        ) : null}

        {compareError ? (
          <EmptyState variant="error" compact title="Compare failed" body={compareError} actionLabel="Retry" onAction={load} />
        ) : null}

        {compare && (
          <>
            <View style={styles.compareGrid}>
              <ComparePane side="winner" data={compare.a} amass={winner} />
              <ComparePane side="loser" data={compare.b} amass={loser} />
            </View>

            <Card elevation="xs">
              <Input
                label="Reason · optional but recommended"
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="Why are you merging these two?"
                testID="merge-reason"
              />
            </Card>

            <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
              <Ionicons name="information-circle" size={18} color={colors.warning} />
              <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                All listings and representations on the loser move to the winner. The loser&apos;s ID keeps resolving as an alias. This is written to the immutable audit log.
              </AppText>
            </View>

            <Button
              label={`Merge ${loser} into ${winner}`}
              variant="brand"
              size="lg"
              fullWidth
              iconLeft="git-merge"
              onPress={() => setConfirmOpen(true)}
              testID="merge-confirm"
            />
          </>
        )}
      </ScrollView>

      <Sheet visible={confirmOpen} onClose={() => { if (!merging) setConfirmOpen(false); }} title="Merge properties?">
        <View style={{ gap: 10, marginBottom: 16 }}>
          <LedgerRow label="Winner" value={winner} tone="success" />
          <LedgerRow label="Loser" value={loser} tone="brand" />
          <AppText variant="bodySm" tone="secondary">
            This can&apos;t be undone from the app. The merge is recorded in the audit log with your admin ID.
          </AppText>
        </View>
        <View style={{ gap: 8 }}>
          <Button label="Confirm merge" variant="brand" size="lg" fullWidth iconLeft="git-merge" loading={merging} onPress={doMerge} testID="merge-confirm-final" />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setConfirmOpen(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function LedgerRow({ label, value, tone }: { label: string; value: string; tone: "success" | "brand" }) {
  return (
    <View style={styles.ledgerRow}>
      <Badge label={label} tone={tone} />
      <AppText variant="bodyMedium" tabular numberOfLines={1} style={{ flex: 1, textAlign: "right" }}>{value}</AppText>
    </View>
  );
}

function ComparePane({ side, data, amass }: { side: Side; data: any; amass: string }) {
  const { colors } = useTheme();
  const isWinner = side === "winner";
  const accent = isWinner ? colors.success : colors.brand;
  return (
    <Card elevation="xs" style={{ flex: 1, gap: 6, borderWidth: 1.5, borderColor: accent }} padded={false}>
      <View style={[styles.paneHead, { backgroundColor: isWinner ? colors.successSoft : colors.brandSoft }]}>
        <Badge label={isWinner ? "Winner" : "Loser"} tone={isWinner ? "success" : "brand"} icon={isWinner ? "trophy" : "git-branch"} />
        <AppText variant="caption" weight="bold" tabular numberOfLines={1}>{amass}</AppText>
      </View>
      <View style={{ padding: 12, gap: 6 }}>
        <Field lbl="Type" val={data.property_type ?? "—"} />
        <Field lbl="Address" val={[data.street, data.area, data.lga, data.state].filter(Boolean).join(", ") || "—"} />
        <Field lbl="Bedrooms" val={String(data.details?.bedrooms ?? "—")} />
        <Field lbl="Size (sqm)" val={String(data.details?.building_size_sqm ?? "—")} />
        <Field lbl="Listings" val={String(data.listings_count)} />
        <Field lbl="Reps" val={String(data.representations_count)} />
        <Field lbl="Status" val={data.physical_status ?? "—"} />
        <Field lbl="Aliases" val={(data.aliases || []).join(", ") || "—"} />
      </View>
    </Card>
  );
}

function Field({ lbl, val }: { lbl: string; val: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="micro" tone="tertiary" uppercase>{lbl}</AppText>
      <AppText variant="caption" numberOfLines={2}>{val}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  compareGrid: { flexDirection: "row", gap: 10 },
  paneHead: { padding: 10, gap: 6 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
