/**
 * AMASS Admin Cockpit — Phase 6D
 * Landing page: tile grid of admin duties + live counts.
 * Access is gated by `user.is_admin` on the client; the backend also enforces
 * `require_admin` on every underlying endpoint.
 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { Appear, AppText, Badge, Card, EmptyState, Screen, ScreenHeader, SkeletonRows, StatTile, type IconName } from "@/src/ui";

type Dash = Awaited<ReturnType<typeof api.adminDashboard>>;
type Tone = "default" | "brand" | "mass" | "fix" | "success" | "warning" | "info" | "premium";

export default function AdminCockpitHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
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
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Admin Cockpit" />
        <EmptyState variant="error" icon="lock-closed" title="Admin access required" body="This area is restricted to AMASS administrators. Contact ops@amass.africa if you need access." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-cockpit">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Cockpit" subtitle="Operations · Trust & safety" />
      <ScrollView
        contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 + insets.bottom }}
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
        {loading && !dash ? (
          <SkeletonRows rows={5} />
        ) : error && !dash ? (
          <EmptyState variant="error" title="Couldn't load the cockpit" body={error} actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
        ) : null}

        {dash && (
          <>
            <View style={styles.statRow}>
              <StatTile icon="home" value={dash.total_properties} label="Properties" animate />
              <StatTile icon="pricetags" tone="info" value={dash.total_listings} label="Listings" animate />
              <StatTile icon="git-merge" tone="premium" value={dash.merged_properties} label="Merged" animate />
            </View>

            <View style={{ gap: 10 }}>
              <Tile title="Duplicate review queue" caption={`${dash.pending_duplicate_review} propert${dash.pending_duplicate_review === 1 ? "y" : "ies"} flagged`} icon="git-compare-outline" badge={dash.pending_duplicate_review} tone="mass" onPress={() => router.push("/admin/duplicate-queue" as any)} testID="tile-dup-queue" />
              <Tile title="Representation reviews" caption={`${dash.pending_representations} pending · ${dash.docs_requested} docs requested`} icon="ribbon-outline" badge={dash.pending_representations + dash.docs_requested} tone="success" onPress={() => router.push("/admin/representations" as any)} testID="tile-rep-queue" />
              <Tile title="Identity & documents (KYC)" caption={`${dash.kyc_identity_pending ?? 0} identity checks · ${dash.kyc_documents_pending ?? 0} title documents waiting`} icon="shield-checkmark-outline" badge={(dash.kyc_identity_pending ?? 0) + (dash.kyc_documents_pending ?? 0)} tone="brand" onPress={() => router.push("/admin/kyc" as any)} testID="tile-kyc" />
              <Tile title="Community & moderation" caption="Nearby posts · report moderation · legacy estate queue" icon="people-outline" badge={(dash.pending_estates ?? 0) + (dash.open_social_reports ?? 0)} tone="brand" onPress={() => router.push("/admin/neighbours" as any)} testID="tile-neighbours" />
              <Tile title="Chat reports" caption="Moderation queue · blocks · resolutions" icon="chatbubble-ellipses-outline" tone="brand" onPress={() => router.push("/admin/chat-reports" as any)} testID="tile-chat-reports" />
              <Tile title="Market reports" caption="Flagged Declutter listings · pause · remove" icon="flag-outline" tone="warning" onPress={() => router.push("/admin/market-reports" as any)} testID="tile-market-reports" />
              <Tile title="FIXA providers" caption="Verify Join FIXA applications · provider reports · hide / reinstate" icon="hammer-outline" tone="fix" onPress={() => router.push("/admin/fixa" as any)} testID="tile-fixa" />
              <Tile title="Audit log" caption="Immutable event stream across all properties" icon="document-text-outline" tone="default" onPress={() => router.push("/admin/audit-log" as any)} testID="tile-audit" />
              <Tile title="Merge / Verify properties" caption="Search by AMASS ID → compare → merge or verify" icon="swap-horizontal-outline" tone="brand" onPress={() => router.push("/admin/duplicate-queue" as any)} testID="tile-merge" />
              <Tile title="Property Discovery" caption="Google Places search · Cost meter · Candidate → Lead pipeline" icon="compass-outline" tone="fix" onPress={() => router.push("/admin/discovery" as any)} testID="tile-discovery" />
              <Tile title="Platform settings" caption="Feature flags · Property types · Config" icon="settings-outline" tone="info" onPress={() => router.push("/admin/settings" as any)} testID="tile-settings" />
              <Tile title="Monetization & pricing" caption="MASS fees by zone (5–12) · token value · revenue report" icon="pricetags-outline" tone="mass" onPress={() => router.push("/admin/pricing" as any)} testID="tile-pricing" />
            </View>

            <AppText variant="caption" tone="tertiary" align="center">
              Generated at {new Date(dash.generated_at).toLocaleTimeString()} · Pull to refresh
            </AppText>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

let tileIndex = 0;
function Tile({ title, caption, icon, badge, tone = "default", onPress, testID }: { title: string; caption: string; icon: IconName; badge?: number; tone?: Tone; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const fg: Record<Tone, string> = {
    default: colors.text,
    brand: colors.brand,
    mass: colors.massText,
    fix: colors.fixText,
    success: colors.success,
    warning: colors.warning,
    info: colors.info,
    premium: colors.premium,
  };
  const [idx] = React.useState(() => tileIndex++ % 10);
  return (
    <Appear index={idx}>
    <Card onPress={onPress} testID={testID} tone="soft">
      <View style={styles.tileRow}>
        <View style={[styles.tileIcon, { backgroundColor: colors.surface }]}>
          <Ionicons name={icon} size={20} color={fg[tone]} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">{title}</AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={2}>
            {caption}
          </AppText>
        </View>
        {badge ? <Badge label={String(badge)} tone="inverse" /> : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
    </Appear>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", gap: space[3] },
  tileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tileIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
