import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, ProgressBar, Screen, ScreenHeader, Section, Skeleton, StatTile, useToast } from "@/src/ui";

export default function ProjectTracker() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [catalog, setCatalog] = useState<{ milestones: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(false);
    try {
      const [d, c] = await Promise.all([api.getProject(id as string), catalog ? Promise.resolve(catalog) : api.improveCatalog()]);
      setDoc(d);
      if (!catalog) setCatalog(c);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, catalog]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const advance = async (key: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setAdvancing(key);
    try {
      const res = await api.advanceMilestone(id as string, key);
      setDoc((prev: any) => ({ ...prev, milestones_completed: res.milestones_completed }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Milestone complete", label);
    } catch (e: any) {
      toast.error("Couldn't update milestone", e?.message ?? "Please try again.");
    } finally {
      setAdvancing(null);
    }
  };

  if (loading || (!catalog && !error)) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Renovation Project" />
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={120} radius={radii.xl} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Skeleton height={100} radius={radii.lg} style={{ flex: 1 }} />
            <Skeleton height={100} radius={radii.lg} style={{ flex: 1 }} />
            <Skeleton height={100} radius={radii.lg} style={{ flex: 1 }} />
          </View>
          <Skeleton height={260} radius={radii.lg} />
        </View>
      </Screen>
    );
  }

  if (error || !doc || !catalog) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Renovation Project" />
        <EmptyState variant={error ? "error" : "empty"} icon="construct-outline" title={error ? "Couldn't load project" : "Project not found"} body={error ? "Check your connection and try again." : "This project may have been removed."} actionLabel={error ? "Retry" : "Go back"} onAction={error ? () => { setLoading(true); load(); } : () => router.back()} />
      </Screen>
    );
  }

  const completed: Record<string, string> = doc.milestones_completed || {};
  const milestones = catalog.milestones;
  const doneCount = Object.keys(completed).length;
  const progress = milestones.length ? doneCount / milestones.length : 0;
  const nextIdx = milestones.findIndex((m: any) => !completed[m.key]);

  const boq = doc.boq_items || [];
  const boqTotal = boq.reduce((s: number, b: any) => s + (b.total || 0), 0);

  return (
    <Screen testID="project-tracker">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Renovation Project" subtitle={`${doneCount}/${milestones.length} milestones`} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom, gap: space[5] }}
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
        <Animated.View entering={FadeInDown.duration(260)} style={{ paddingHorizontal: space[4], paddingTop: space[2] }}>
          <View style={[styles.hero, { backgroundColor: colors.surfaceInverse }, shadows.md]}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              {doc.property_snapshot?.images?.[0] ? (
                <Image source={{ uri: doc.property_snapshot.images[0] }} style={[styles.propImg, { backgroundColor: "rgba(255,255,255,0.1)" }]} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.propImg, { backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="home" size={24} color="#FFFFFF" />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="h3" color={colors.textInverse} numberOfLines={1}>
                  {doc.property_snapshot?.title ?? "Renovation Project"}
                </AppText>
                <AppText variant="caption" color="rgba(255,255,255,0.6)" numberOfLines={1}>
                  {doc.property_snapshot?.location ?? ""}
                </AppText>
              </View>
            </View>
            <View style={{ marginTop: 14, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <AppText variant="caption" color="rgba(255,255,255,0.7)">
                  Progress
                </AppText>
                <AppText variant="caption" color={colors.textInverse} weight="bold" tabular>
                  {Math.round(progress * 100)}%
                </AppText>
              </View>
              <ProgressBar value={progress} tone="fix" height={6} style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
            </View>
          </View>
        </Animated.View>

        <View style={styles.kpiRow}>
          <StatTile icon="cash-outline" label="Est. cost" value={doc.estimated_cost_ngn ? formatNaira(doc.estimated_cost_ngn) : "—"} />
          <StatTile icon="flag-outline" label="Milestones" value={`${doneCount}/${milestones.length}`} tone="fix" />
          <StatTile icon="pulse-outline" label="Status" value={String(doc.status || "planned").replace(/_/g, " ")} tone="info" />
        </View>

        <Section title="Project tracker" caption={nextIdx >= 0 ? `Next: ${milestones[nextIdx].label}` : "All milestones complete"}>
          <Card elevation="xs">
            {milestones.map((m: any, i: number) => {
              const done = !!completed[m.key];
              const isNext = i === nextIdx;
              const isLast = i === milestones.length - 1;
              return (
                <View key={m.key} style={styles.tRow}>
                  <View style={styles.tSpine}>
                    <View
                      style={[
                        styles.tCircle,
                        done
                          ? { backgroundColor: colors.success, borderColor: colors.success }
                          : isNext
                            ? { backgroundColor: colors.surface, borderColor: colors.primary }
                            : { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      {done ? (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      ) : (
                        <AppText variant="micro" color={isNext ? colors.text : colors.textTertiary}>
                          {i + 1}
                        </AppText>
                      )}
                    </View>
                    {!isLast ? <View style={[styles.tLine, { backgroundColor: done ? colors.success : colors.border }]} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: isLast ? 0 : 18, gap: 4 }}>
                    <AppText variant="bodyMedium" color={done || isNext ? colors.text : colors.textTertiary}>
                      {m.label}
                    </AppText>
                    {done ? (
                      <AppText variant="caption" tone="tertiary" tabular>
                        {new Date(completed[m.key]).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </AppText>
                    ) : (
                      <Button
                        label="Mark done"
                        variant={isNext ? "primary" : "secondary"}
                        size="sm"
                        iconLeft="checkmark-circle-outline"
                        loading={advancing === m.key}
                        onPress={() => advance(m.key, m.label)}
                        testID={`advance-${m.key}`}
                        style={{ alignSelf: "flex-start", marginTop: 2 }}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        </Section>

        <Section title="Scope">
          <Card elevation="xs">
            <AppText variant="body" tone="secondary">
              {doc.scope}
            </AppText>
          </Card>
        </Section>

        {boq.length > 0 ? (
          <Section title="Bill of quantities">
            <Card elevation="xs" padded={false}>
              {boq.map((b: any, i: number) => (
                <View key={i} style={[styles.boqRow, { borderBottomColor: colors.divider }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyMedium">{b.item}</AppText>
                    <AppText variant="caption" tone="tertiary" tabular>
                      {b.qty} {b.unit} × {formatNaira(b.unit_price)}
                    </AppText>
                  </View>
                  <AppText variant="bodyMedium" tabular>
                    {formatNaira(b.total || 0)}
                  </AppText>
                </View>
              ))}
              <View style={[styles.boqTotalRow, { backgroundColor: colors.surfaceAlt }]}>
                <AppText variant="label" tone="secondary" uppercase>
                  BOQ subtotal
                </AppText>
                <AppText variant="h3" tabular>
                  {formatNaira(boqTotal)}
                </AppText>
              </View>
            </Card>
          </Section>
        ) : null}

        {doc.recommended_providers?.length > 0 ? (
          <View style={{ gap: 12 }}>
            <View style={{ paddingHorizontal: space[4], flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AppText variant="h3">Recommended FIXA pros</AppText>
              <Badge label="Verified" tone="fix" icon="shield-checkmark" size="xs" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
              {doc.recommended_providers.map((p: any) => (
                <Card key={p.id} onPress={() => router.push(`/marketplace/${p.id}` as any)} elevation="xs" style={{ width: 156, gap: 4 }}>
                  {p.seller_avatar ? <Image source={{ uri: p.seller_avatar }} style={[styles.provAvatar, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} /> : null}
                  <AppText variant="bodyMedium" numberOfLines={1} style={{ marginTop: 6 }}>
                    {p.seller_name}
                  </AppText>
                  <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                    {p.subcategory}
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                    <Ionicons name="star" size={11} color={colors.mass} />
                    <AppText variant="caption" weight="bold" tabular>
                      {(p.seller_rating ?? p.rating ?? 0).toFixed(1)}
                    </AppText>
                  </View>
                </Card>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {doc.recommended_brands?.length > 0 ? (
          <View style={{ gap: 12 }}>
            <AppText variant="h3" style={{ paddingHorizontal: space[4] }}>
              Recommended brands
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
              {doc.recommended_brands.map((b: any) => (
                <Card key={b.id} onPress={() => router.push(`/marketplace/${b.id}` as any)} elevation="xs" padded={false} style={{ width: 136, padding: 10, gap: 4 }}>
                  {b.image ? <Image source={{ uri: b.image }} style={[styles.brandImg, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} /> : null}
                  <AppText variant="caption" weight="semibold" numberOfLines={2} style={{ marginTop: 4 }}>
                    {b.name}
                  </AppText>
                  <AppText variant="bodyMedium" tabular>
                    {formatNaira(b.price)}
                  </AppText>
                </Card>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: space[4] }}>
          <Button label="Shop the Market" variant="brand" size="lg" fullWidth iconLeft="storefront" onPress={() => router.push("/(tabs)/marketplace" as any)} testID="shop-marketplace" />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[4] },
  propImg: { width: 68, height: 68, borderRadius: radii.md },
  kpiRow: { flexDirection: "row", gap: 8, paddingHorizontal: space[4] },
  tRow: { flexDirection: "row", gap: 12, minHeight: 44 },
  tSpine: { width: 28, alignItems: "center" },
  tCircle: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  tLine: { flex: 1, width: 2, marginTop: 4, borderRadius: 1 },
  boqRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  boqTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
  hRow: { gap: 10, paddingHorizontal: space[4] },
  provAvatar: { width: 40, height: 40, borderRadius: 20 },
  brandImg: { width: "100%", height: 70, borderRadius: radii.xs },
});
