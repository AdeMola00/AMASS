/**
 * Admin Duplicate Review Queue — Phase 6D
 * Lists properties flagged for review + nearest neighbours, with actions:
 *   • Clear (mark as separate)
 *   • Compare → Merge (opens the merge screen with prefilled winner/loser)
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type QueueItem = Awaited<ReturnType<typeof api.adminDuplicateQueue>>["items"][number];

export default function AdminDuplicateQueue() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminDuplicateQueue();
      setItems(r.items);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false);
      return;
    }
    load();
  }, [user, load]);

  const clear = async (amass_id: string) => {
    Alert.alert("Clear from queue?", "Confirm the property is genuinely a separate physical property.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        onPress: async () => {
          try {
            await api.adminResolveDupReview(amass_id, { action: "clear" });
            load();
          } catch (e: any) {
            Alert.alert("Failed", e?.message ?? "Try again");
          }
        },
      },
    ]);
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Duplicate Queue" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={40} color={colors.red} />
          <Text style={styles.blockedText}>Admins only</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-dup-queue">
      <Header title="Duplicate Queue" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.property.amass_property_id}
          contentContainerStyle={{ padding: spacing.xl, gap: 14, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={44} color={colors.emerald} />
              <Text style={styles.emptyTitle}>Queue is empty</Text>
              <Text style={styles.emptySub}>No properties need duplicate review right now.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, shadows.soft]}>
              {/* Flagged property */}
              <View style={styles.propRow}>
                <View style={styles.thumb}>
                  {item.property.cover ? (
                    <Image source={{ uri: item.property.cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  ) : (
                    <Ionicons name="home" size={22} color={colors.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.amassId}>{item.property.amass_property_id}</Text>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>SCORE {item.property.duplicate_score_at_creation ?? "?"}</Text>
                    </View>
                  </View>
                  <Text style={styles.addr}>
                    {[item.property.street, item.property.area, item.property.lga, item.property.state].filter(Boolean).join(", ")}
                  </Text>
                  <Text style={styles.reason} numberOfLines={2}>{item.property.review_reason}</Text>
                </View>
              </View>

              {/* Candidates */}
              {item.candidates.length > 0 && (
                <>
                  <Text style={styles.candLbl}>NEAREST NEIGHBOURS</Text>
                  {item.candidates.map((c) => (
                    <View key={c.amass_property_id} style={styles.candRow}>
                      <Ionicons name="location" size={14} color={colors.red} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.candId}>{c.amass_property_id}</Text>
                        <Text style={styles.candAddr}>
                          {[c.street, c.area, c.lga, c.state].filter(Boolean).join(", ")}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.compareBtn}
                        onPress={() =>
                          router.push(
                            `/admin/merge?winner=${encodeURIComponent(c.amass_property_id)}&loser=${encodeURIComponent(item.property.amass_property_id)}` as any
                          )
                        }
                        testID={`compare-${c.amass_property_id}`}
                      >
                        <Text style={styles.compareBtnText}>Compare</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <Pressable
                  style={[styles.actionBtn, styles.actionClear]}
                  onPress={() => clear(item.property.amass_property_id)}
                  testID={`clear-${item.property.amass_property_id}`}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.text} />
                  <Text style={styles.actionText}>Clear</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionView]}
                  onPress={() => router.push(`/property-passport/${item.property.amass_property_id}` as any)}
                  testID={`view-${item.property.amass_property_id}`}
                >
                  <Ionicons name="eye-outline" size={16} color="#fff" />
                  <Text style={[styles.actionText, { color: "#fff" }]}>View Passport</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
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
  card: { padding: 14, borderRadius: radius.md, backgroundColor: "#fff", gap: 10 },
  propRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  amassId: { fontSize: 13, fontWeight: "800", color: colors.text },
  pill: {
    backgroundColor: colors.red,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  addr: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginTop: 2 },
  reason: { fontSize: 11, color: colors.textTertiary, fontStyle: "italic", marginTop: 4 },
  candLbl: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginTop: 4,
  },
  candRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  candId: { fontSize: 12, fontWeight: "700", color: colors.text },
  candAddr: { fontSize: 11, color: colors.textTertiary },
  compareBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  compareBtnText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
  },
  actionClear: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.border },
  actionView: { backgroundColor: colors.ink },
  actionText: { fontSize: 12, fontWeight: "800", color: colors.text },
  empty: { padding: spacing.xl, alignItems: "center", gap: 8, marginTop: 60 },
  emptyTitle: { ...typography.h2, fontSize: 18 },
  emptySub: { fontSize: 13, color: colors.textTertiary, textAlign: "center" },
  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  blockedText: { fontSize: 14, color: colors.text, fontWeight: "700" },
});
