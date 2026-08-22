/**
 * AMASS Admin Cockpit — Phase 6D
 * Landing page: tile grid of admin duties + live counts.
 * Access is gated by `user.is_admin` on the client; the backend also enforces
 * `require_admin` on every underlying endpoint.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type Dash = Awaited<ReturnType<typeof api.adminDashboard>>;

export default function AdminCockpitHub() {
  const router = useRouter();
  const { user } = useAuth();
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.adminDashboard();
      setDash(d);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
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

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Admin Cockpit" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={48} color={colors.red} />
          <Text style={styles.blockedTitle}>Admin access required</Text>
          <Text style={styles.blockedSub}>
            This area is restricted to AMASS administrators. Contact ops@amass.africa if you need access.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-cockpit">
      <Header title="Admin Cockpit" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
      >
        {loading && !dash ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.red} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={22} color={colors.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {dash && (
          <>
            <View style={styles.statRow}>
              <StatCard label="Total properties" value={dash.total_properties} />
              <StatCard label="Total listings" value={dash.total_listings} />
              <StatCard label="Merged" value={dash.merged_properties} />
            </View>

            <View style={{ gap: 12 }}>
              <Tile
                title="Duplicate review queue"
                caption={`${dash.pending_duplicate_review} property${dash.pending_duplicate_review === 1 ? "" : "ies"} flagged`}
                icon="git-compare-outline"
                badge={dash.pending_duplicate_review}
                accent={colors.gold}
                onPress={() => router.push("/admin/duplicate-queue" as any)}
                testID="tile-dup-queue"
              />
              <Tile
                title="Representation reviews"
                caption={`${dash.pending_representations} pending · ${dash.docs_requested} docs requested`}
                icon="ribbon-outline"
                badge={dash.pending_representations + dash.docs_requested}
                accent={colors.emerald}
                onPress={() => router.push("/admin/representations" as any)}
                testID="tile-rep-queue"
              />
              <Tile
                title="Audit log"
                caption="Immutable event stream across all properties"
                icon="document-text-outline"
                accent={colors.ink}
                onPress={() => router.push("/admin/audit-log" as any)}
                testID="tile-audit"
              />
              <Tile
                title="Merge / Verify properties"
                caption="Search by AMASS ID → compare → merge or verify"
                icon="swap-horizontal-outline"
                accent={colors.red}
                onPress={() => router.push("/admin/duplicate-queue" as any)}
                testID="tile-merge"
              />
              <Tile
                title="Property Discovery"
                caption="Google Places search · Cost meter · Candidate → Lead pipeline"
                icon="compass-outline"
                accent={colors.emerald}
                onPress={() => router.push("/admin/discovery" as any)}
                testID="tile-discovery"
              />
              <Tile
                title="Platform settings"
                caption="Feature flags · Property types · Config"
                icon="settings-outline"
                accent={colors.textSecondary}
                onPress={() => router.push("/admin/settings" as any)}
                testID="tile-settings"
              />
            </View>

            <Text style={styles.hint}>
              Generated at {new Date(dash.generated_at).toLocaleTimeString()} · Pull to refresh
            </Text>
          </>
        )}
      </ScrollView>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={[styles.stat, shadows.soft]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Tile({
  title,
  caption,
  icon,
  badge,
  accent,
  onPress,
  testID,
}: {
  title: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: number;
  accent: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={[styles.tile, shadows.soft]} onPress={onPress} testID={testID}>
      <View style={[styles.tileIcon, { backgroundColor: accent }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileCaption}>{caption}</Text>
      </View>
      {badge !== undefined && badge > 0 && (
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
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
  statRow: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  statValue: { fontSize: 24, fontWeight: "900", color: colors.text },
  statLabel: { fontSize: 11, color: colors.textTertiary, marginTop: 2, fontWeight: "600", textAlign: "center" },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  tileCaption: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  tileBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  errorBox: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.redSurface,
    alignItems: "center",
  },
  errorText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600" },
  hint: { fontSize: 11, color: colors.textTertiary, textAlign: "center", marginTop: 8 },

  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 60 },
  blockedTitle: { ...typography.h2, fontSize: 18 },
  blockedSub: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },
});
