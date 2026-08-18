/**
 * Admin Merge — side-by-side compare, then merge two AMASS IDs.
 * Winner keeps its AMASS ID; loser's ID joins winner.aliases[] so QR codes
 * continue to resolve to the canonical passport.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type Side = "winner" | "loser";

export default function AdminMergeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ winner?: string; loser?: string }>();

  const [winner, setWinner] = useState(String(params.winner ?? ""));
  const [loser, setLoser] = useState(String(params.loser ?? ""));
  const [compare, setCompare] = useState<{ a: any; b: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!winner || !loser) return;
    setLoading(true);
    try {
      const c = await api.adminCompareProperties(winner, loser);
      setCompare(c);
    } catch (e: any) {
      Alert.alert("Compare failed", e?.message ?? "Try again");
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
    Alert.alert(
      "Merge properties?",
      `Winner: ${winner}\nLoser: ${loser}\n\nAll listings and representations on the loser will move to the winner. Loser's ID will keep working as an alias. This action is written to the immutable audit log.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Merge",
          style: "destructive",
          onPress: async () => {
            setMerging(true);
            try {
              const res = await api.adminMergeProperties({
                winner_amass_id: winner,
                loser_amass_id: loser,
                reason: reason || undefined,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert(
                "Merged",
                `${res.listings_moved} listing(s) and ${res.reps_moved} representation(s) moved.`,
                [{ text: "OK", onPress: () => router.replace("/admin/duplicate-queue" as any) }]
              );
            } catch (e: any) {
              Alert.alert("Merge failed", e?.message ?? "Try again");
            } finally {
              setMerging(false);
            }
          },
        },
      ]
    );
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Merge" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={40} color={colors.red} />
          <Text style={styles.blockedText}>Admins only</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-merge">
      <Header title="Merge Properties" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 40 }}>
        <View style={styles.searchBox}>
          <Text style={styles.subLbl}>WINNER (keeps AMASS ID)</Text>
          <TextInput
            style={styles.input}
            value={winner}
            onChangeText={setWinner}
            autoCapitalize="characters"
            placeholder="AMASS-LAG-00000001"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.subLbl, { marginTop: 8 }]}>LOSER (becomes alias)</Text>
          <TextInput
            style={styles.input}
            value={loser}
            onChangeText={setLoser}
            autoCapitalize="characters"
            placeholder="AMASS-LAG-00000005"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable style={styles.loadBtn} onPress={load} disabled={loading || !winner || !loser}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loadBtnText}>Compare</Text>}
          </Pressable>
        </View>

        {compare && (
          <>
            <View style={styles.compareGrid}>
              <ComparePane side="winner" data={compare.a} amass={winner} />
              <ComparePane side="loser" data={compare.b} amass={loser} />
            </View>

            <View style={styles.reasonBox}>
              <Text style={styles.subLbl}>REASON (optional but recommended)</Text>
              <TextInput
                style={[styles.input, { minHeight: 60, textAlignVertical: "top", paddingTop: 10 }]}
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="Why are you merging these two?"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <Pressable
              style={[styles.mergeBtn, merging && { opacity: 0.5 }]}
              disabled={merging}
              onPress={doMerge}
              testID="merge-confirm"
            >
              {merging ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="git-merge" size={18} color="#fff" />
                  <Text style={styles.mergeBtnText}>Merge {loser} into {winner}</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ComparePane({
  side,
  data,
  amass,
}: {
  side: Side;
  data: any;
  amass: string;
}) {
  const isWinner = side === "winner";
  return (
    <View style={[styles.pane, { borderColor: isWinner ? colors.emerald : colors.red }]}>
      <View style={[styles.paneBadge, { backgroundColor: isWinner ? colors.emerald : colors.red }]}>
        <Text style={styles.paneBadgeText}>{isWinner ? "WINNER" : "LOSER"}</Text>
      </View>
      <Text style={styles.paneAmass}>{amass}</Text>
      <Field lbl="Type" val={data.property_type ?? "—"} />
      <Field lbl="Address" val={[data.street, data.area, data.lga, data.state].filter(Boolean).join(", ") || "—"} />
      <Field lbl="Bedrooms" val={String(data.details?.bedrooms ?? "—")} />
      <Field lbl="Size (sqm)" val={String(data.details?.building_size_sqm ?? "—")} />
      <Field lbl="Listings" val={String(data.listings_count)} />
      <Field lbl="Reps" val={String(data.representations_count)} />
      <Field lbl="Status" val={data.physical_status ?? "—"} />
      <Field lbl="Aliases" val={(data.aliases || []).join(", ") || "—"} />
    </View>
  );
}

function Field({ lbl, val }: { lbl: string; val: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLbl}>{lbl}</Text>
      <Text style={styles.fieldVal} numberOfLines={2}>{val}</Text>
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },

  searchBox: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", gap: 6, ...shadows.soft },
  subLbl: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.6 },
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
  },
  loadBtn: {
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  loadBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  compareGrid: { flexDirection: "row", gap: 10 },
  pane: {
    flex: 1,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 2,
    gap: 6,
    ...shadows.soft,
  },
  paneBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: 4,
  },
  paneBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  paneAmass: { fontSize: 12, fontWeight: "800", color: colors.text, marginBottom: 6 },
  field: { paddingVertical: 4 },
  fieldLbl: { fontSize: 9, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.4 },
  fieldVal: { fontSize: 12, color: colors.text, fontWeight: "600", marginTop: 2 },

  reasonBox: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", gap: 6 },

  mergeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  mergeBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  blockedText: { fontSize: 14, color: colors.text, fontWeight: "700" },
});
