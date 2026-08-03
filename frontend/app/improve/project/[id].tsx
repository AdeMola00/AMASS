import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

export default function ProjectTracker() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [catalog, setCatalog] = useState<{ milestones: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [d, c] = await Promise.all([
        api.getProject(id as string),
        catalog ? Promise.resolve(catalog) : api.improveCatalog(),
      ]);
      setDoc(d);
      if (!catalog) setCatalog(c);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Please try again.");
    }
  }, [id, catalog]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const advance = async (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setAdvancing(key);
    try {
      const res = await api.advanceMilestone(id as string, key);
      setDoc((prev: any) => ({ ...prev, milestones_completed: res.milestones_completed }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Please try again.");
    } finally {
      setAdvancing(null);
    }
  };

  if (loading || !catalog) {
    return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  }
  if (!doc) return <View style={styles.center}><Text>Not found</Text></View>;

  const completed: Record<string, string> = doc.milestones_completed || {};
  const milestones = catalog.milestones;
  const progressPct = Math.round((Object.keys(completed).length / milestones.length) * 100);

  const boq = doc.boq_items || [];
  const boqTotal = boq.reduce((s: number, b: any) => s + (b.total || 0), 0);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Renovation Project</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* Hero */}
        <LinearGradient colors={["#0A0A0A", "#1F1F1F"]} style={styles.hero}>
          {doc.property_snapshot?.images?.[0] && (
            <Image source={{ uri: doc.property_snapshot.images[0] }} style={styles.propImg} contentFit="cover" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.propTitle} numberOfLines={1}>
              {doc.property_snapshot?.title ?? "Renovation Project"}
            </Text>
            <Text style={styles.propMeta} numberOfLines={1}>
              {doc.property_snapshot?.location ?? ""}
            </Text>
            <View style={styles.progressWrap}>
              <View style={styles.progressBg}>
                <View style={[styles.progressBar, { width: `${progressPct}%` }]} />
              </View>
              <Text style={styles.progressText}>{progressPct}% complete</Text>
            </View>
          </View>
        </LinearGradient>

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <Kpi label="Est. cost" value={doc.estimated_cost_ngn ? formatNaira(doc.estimated_cost_ngn) : "—"} />
          <Kpi label="Milestones" value={`${Object.keys(completed).length}/${milestones.length}`} />
          <Kpi label="Status" value={(doc.status || "planned").replace(/_/g, " ")} capitalize />
        </View>

        {/* Milestone tracker */}
        <SectionTitle>Project Tracker</SectionTitle>
        <View style={styles.tracker}>
          {milestones.map((m: any, i: number) => {
            const done = !!completed[m.key];
            const isLast = i === milestones.length - 1;
            return (
              <View key={m.key} style={styles.tRow}>
                <View style={styles.tSpine}>
                  <View
                    style={[
                      styles.tCircle,
                      done ? styles.tCircleDone : styles.tCircleOpen,
                    ]}
                  >
                    {done ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : (
                      <Text style={styles.tCircleText}>{i + 1}</Text>
                    )}
                  </View>
                  {!isLast && <View style={[styles.tLine, done && styles.tLineDone]} />}
                </View>
                <View style={{ flex: 1, paddingBottom: 18 }}>
                  <Text style={[styles.tLabel, done && { color: colors.text }]}>{m.label}</Text>
                  {done ? (
                    <Text style={styles.tAt}>
                      {new Date(completed[m.key]).toLocaleString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </Text>
                  ) : (
                    <Pressable
                      onPress={() => advance(m.key)}
                      disabled={advancing === m.key}
                      style={[styles.tAdvance, advancing === m.key && { opacity: 0.6 }]}
                      testID={`advance-${m.key}`}
                    >
                      {advancing === m.key ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={12} color={colors.text} />
                          <Text style={styles.tAdvanceText}>Mark done</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Scope */}
        <SectionTitle>Scope</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.body}>{doc.scope}</Text>
        </View>

        {/* Bill of Quantities */}
        {boq.length > 0 && (
          <>
            <SectionTitle>Bill of Quantities</SectionTitle>
            <View style={[styles.card, { padding: 0 }]}>
              {boq.map((b: any, i: number) => (
                <View key={i} style={[styles.boqRow, i === boq.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.boqItem}>{b.item}</Text>
                    <Text style={styles.boqSub}>
                      {b.qty} {b.unit} × {formatNaira(b.unit_price)}
                    </Text>
                  </View>
                  <Text style={styles.boqTotal}>{formatNaira(b.total || 0)}</Text>
                </View>
              ))}
              <View style={styles.boqTotalRow}>
                <Text style={styles.boqTotalLabel}>BOQ subtotal</Text>
                <Text style={styles.boqTotalAmount}>{formatNaira(boqTotal)}</Text>
              </View>
            </View>
          </>
        )}

        {/* Recommended providers */}
        {doc.recommended_providers?.length > 0 && (
          <>
            <SectionTitle>Recommended FIXA Pros</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
              {doc.recommended_providers.map((p: any) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/marketplace/${p.id}` as any)}
                  style={styles.provCard}
                >
                  {p.seller_avatar && (
                    <Image source={{ uri: p.seller_avatar }} style={styles.provAvatar} contentFit="cover" />
                  )}
                  <Text style={styles.provName} numberOfLines={1}>{p.seller_name}</Text>
                  <Text style={styles.provTrade}>{p.subcategory}</Text>
                  <View style={styles.provRatingRow}>
                    <Ionicons name="star" size={11} color="#F5B301" />
                    <Text style={styles.provRating}>{(p.seller_rating ?? p.rating ?? 0).toFixed(1)}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Recommended brands */}
        {doc.recommended_brands?.length > 0 && (
          <>
            <SectionTitle>Recommended Brands</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
              {doc.recommended_brands.map((b: any) => (
                <Pressable
                  key={b.id}
                  onPress={() => router.push(`/marketplace/${b.id}` as any)}
                  style={styles.brandCard}
                >
                  {b.image && <Image source={{ uri: b.image }} style={styles.brandImg} contentFit="cover" />}
                  <Text style={styles.brandName} numberOfLines={2}>{b.name}</Text>
                  <Text style={styles.brandPrice}>{formatNaira(b.price)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        <View style={styles.ctaWrap}>
          <Pressable onPress={() => router.push("/marketplace" as any)} style={styles.cta}>
            <Ionicons name="storefront" size={16} color="#fff" />
            <Text style={styles.ctaText}>Shop marketplace</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Kpi({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, capitalize && { textTransform: "capitalize" }]}>{value}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#0A0A0A",
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },

  hero: {
    flexDirection: "row", gap: 12, alignItems: "center",
    marginHorizontal: spacing.lg, marginTop: 8,
    padding: 16, borderRadius: 20,
  },
  propImg: { width: 72, height: 72, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)" },
  propTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  propMeta: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600", marginTop: 3 },
  progressWrap: { marginTop: 10 },
  progressBg: {
    height: 6, borderRadius: 3, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: "#22C55E" },
  progressText: { color: "#fff", fontSize: 10, fontWeight: "800", marginTop: 4, letterSpacing: 0.3 },

  kpiRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginTop: 12 },
  kpi: {
    flex: 1, padding: 12, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    ...shadows.soft, gap: 4,
  },
  kpiLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "800", letterSpacing: 0.4 },
  kpiValue: { fontSize: 15, fontWeight: "900", color: colors.text, letterSpacing: -0.3 },

  sectionTitle: {
    marginHorizontal: spacing.lg, marginTop: 20, marginBottom: 8,
    fontSize: 12, fontWeight: "800", color: colors.text,
    letterSpacing: 0.3, textTransform: "uppercase",
  },

  tracker: { paddingHorizontal: spacing.lg },
  tRow: { flexDirection: "row", gap: 12, minHeight: 44 },
  tSpine: { width: 28, alignItems: "center" },
  tCircle: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
  },
  tCircleDone: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  tCircleOpen: { backgroundColor: "#fff", borderColor: colors.border },
  tCircleText: { fontSize: 11, fontWeight: "900", color: colors.textTertiary },
  tLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  tLineDone: { backgroundColor: "#22C55E" },
  tLabel: { fontSize: 13, fontWeight: "800", color: colors.textTertiary, marginTop: 4 },
  tAt: { fontSize: 10, color: colors.textTertiary, fontWeight: "600", marginTop: 2 },
  tAdvance: {
    alignSelf: "flex-start", marginTop: 4,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  tAdvanceText: { fontSize: 10, fontWeight: "800", color: colors.text, letterSpacing: 0.2 },

  card: {
    marginHorizontal: spacing.lg,
    padding: 14, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
  },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },

  boqRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
  },
  boqItem: { fontSize: 13, fontWeight: "800", color: colors.text },
  boqSub: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  boqTotal: { fontSize: 13, fontWeight: "900", color: colors.text },
  boqTotalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 14, backgroundColor: colors.surfaceSecondary,
  },
  boqTotalLabel: { fontSize: 12, fontWeight: "800", color: colors.text, letterSpacing: 0.3, textTransform: "uppercase" },
  boqTotalAmount: { fontSize: 16, fontWeight: "900", color: colors.text, letterSpacing: -0.4 },

  hRow: { gap: 10, paddingHorizontal: spacing.lg },
  provCard: {
    width: 150, padding: 12, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    gap: 4, ...shadows.soft,
  },
  provAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary },
  provName: { fontSize: 12, fontWeight: "800", color: colors.text, marginTop: 6 },
  provTrade: { fontSize: 10, color: colors.textTertiary, fontWeight: "700" },
  provRatingRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  provRating: { fontSize: 11, fontWeight: "800", color: colors.text },

  brandCard: {
    width: 130, padding: 10, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    gap: 4, ...shadows.soft,
  },
  brandImg: { width: "100%", height: 70, borderRadius: 8, backgroundColor: colors.surfaceSecondary },
  brandName: { fontSize: 11, fontWeight: "800", color: colors.text, marginTop: 4, lineHeight: 14 },
  brandPrice: { fontSize: 11, fontWeight: "900", color: colors.text },

  ctaWrap: { padding: spacing.lg },
  cta: {
    height: 52, borderRadius: radius.pill, backgroundColor: colors.red,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
