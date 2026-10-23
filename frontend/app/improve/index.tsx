import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, SegmentedControl, SkeletonRows } from "@/src/ui";
import type { BadgeTone } from "@/src/ui";

type Tab = "inspections" | "loans" | "projects";

const STATUS_TONE: Record<string, BadgeTone> = {
  requested: "warning",
  scheduled: "info",
  in_progress: "premium",
  completed: "success",
  cancelled: "neutral",
  submitted: "warning",
  under_review: "info",
  approved: "success",
  rejected: "error",
  disbursed: "success",
  planned: "info",
  active: "premium",
  on_hold: "warning",
};

export default function ImproveHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const [tab, setTab] = useState<Tab>("inspections");
  const [data, setData] = useState<{ inspections: any[]; finance_applications: any[]; projects: any[] }>({
    inspections: [],
    finance_applications: [],
    projects: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await api.improveMine());
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

  const rows = tab === "inspections" ? data.inspections : tab === "loans" ? data.finance_applications : data.projects;

  return (
    <Screen testID="improve-hub">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Improve My Property" right={<IconButton icon="notifications-outline" label="Notifications" onPress={() => router.push("/notifications" as any)} />} />

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
        <Animated.View entering={FadeInDown.duration(260)} style={[styles.hero, { backgroundColor: colors.surfaceInverse }, shadows.md]}>
          <View style={[styles.heroIcon, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
            <Ionicons name="hammer" size={22} color={colors.brand} />
          </View>
          <AppText variant="h2" color={colors.textInverse}>
            Add value to your property
          </AppText>
          <AppText variant="bodySm" color="rgba(255,255,255,0.72)">
            Book an inspection, apply for financing and track your renovation — all in one place.
          </AppText>
          <View style={styles.heroSteps}>
            {[
              { icon: "clipboard-outline" as const, label: "Inspect" },
              { icon: "cash-outline" as const, label: "Finance" },
              { icon: "construct-outline" as const, label: "Renovate" },
            ].map((s, i) => (
              <View key={s.label} style={styles.heroStep}>
                <Ionicons name={s.icon} size={14} color={colors.brand} />
                <AppText variant="caption" color="rgba(255,255,255,0.85)">
                  {i + 1}. {s.label}
                </AppText>
              </View>
            ))}
          </View>
          <Button label="Start an improvement" variant="primary" size="md" iconLeft="add" onPress={() => router.push("/property-picker" as any)} testID="start-improvement" style={{ marginTop: 14 }} />
        </Animated.View>

        <SegmentedControl<Tab>
          options={[
            { value: "inspections", label: `Inspections${data.inspections.length ? ` · ${data.inspections.length}` : ""}` },
            { value: "loans", label: `Loans${data.finance_applications.length ? ` · ${data.finance_applications.length}` : ""}` },
            { value: "projects", label: `Projects${data.projects.length ? ` · ${data.projects.length}` : ""}` },
          ]}
          value={tab}
          onChange={setTab}
          testIDPrefix="tab"
        />

        {loading ? (
          <Card elevation="xs">
            <SkeletonRows rows={3} />
          </Card>
        ) : error ? (
          <EmptyState variant="error" compact title="Couldn't load your improvements" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
        ) : rows.length === 0 ? (
          <Empty tab={tab} onStart={() => router.push("/property-picker" as any)} />
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map((r: any, i: number) => (
              <Animated.View key={r.id} entering={FadeInDown.delay(40 + i * 30).duration(220)}>
                <RowCard
                  r={r}
                  tab={tab}
                  onPress={() => {
                    if (tab === "inspections") router.push(`/improve/inspection/${r.id}` as any);
                    else if (tab === "loans") router.push(`/improve/finance/${r.id}` as any);
                    else router.push(`/improve/project/${r.id}` as any);
                  }}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Empty({ tab, onStart }: { tab: Tab; onStart: () => void }) {
  const copy = {
    inspections: {
      icon: "clipboard-outline" as const,
      title: "No inspections yet",
      body: "Book an inspection from any property page to unlock a full report and Health Score.",
    },
    loans: {
      icon: "cash-outline" as const,
      title: "No loan applications",
      body: "AMASS partners with Access, GTBank, First Bank and UBA to finance your renovation.",
    },
    projects: {
      icon: "construct-outline" as const,
      title: "No active projects",
      body: "Projects are created after your inspection and financing are in place.",
    },
  }[tab];
  return <EmptyState compact icon={copy.icon} title={copy.title} body={copy.body} actionLabel={tab === "projects" ? undefined : "Get started"} onAction={onStart} testID={`improve-empty-${tab}`} />;
}

function RowCard({ r, tab, onPress }: { r: any; tab: Tab; onPress: () => void }) {
  const { colors } = useTheme();
  const status: string = r.status || (r.milestones_completed ? "planned" : "requested");
  const title = tab === "inspections" ? (r.property_snapshot?.title ?? "Inspection") : tab === "loans" ? (r.product_name ?? "Loan") : (r.property_snapshot?.title ?? "Renovation Project");
  const sub =
    tab === "inspections"
      ? `Health Score ${r.health_score ?? "—"} · ${new Date(r.created_at).toLocaleDateString()}`
      : tab === "loans"
        ? `${formatNaira(r.amount_requested_ngn ?? 0)} · ${r.tenor_months ?? 24} months`
        : `${Object.keys(r.milestones_completed || {}).length}/9 milestones`;
  const image = r.property_snapshot?.images?.[0];
  const icon = tab === "inspections" ? "clipboard" : tab === "loans" ? "cash" : "construct";
  return (
    <Card onPress={onPress} elevation="xs" padded={false} testID={`row-${tab}-${r.id}`} style={{ padding: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {image ? (
          <Image source={{ uri: image }} style={[styles.thumb, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name={icon} size={22} color={colors.textTertiary} />
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" tone="tertiary" numberOfLines={1} tabular>
            {sub}
          </AppText>
          <Badge label={status.replace(/_/g, " ")} tone={STATUS_TONE[status] ?? "neutral"} size="xs" style={{ marginTop: 2 }} />
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[5], gap: 6 },
  heroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  heroSteps: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  heroStep: { flexDirection: "row", alignItems: "center", gap: 6 },
  thumb: { width: 60, height: 60, borderRadius: radii.sm },
});
