import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { colors, radius, spacing, formatNaira } from "@/src/constants/theme";

export type NeighborhoodSheetRef = {
  open: (propertyId: string) => void;
  close: () => void;
};

type Intel = Awaited<ReturnType<typeof api.propertyIntelligence>>;

/**
 * Neighborhood Intelligence bottom sheet — Redfin/Zillow style deep-dive.
 * Trigger by tapping "Neighborhood insights" on a property.
 */
export const NeighborhoodSheet = forwardRef<NeighborhoodSheetRef, object>((_, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Intel | null>(null);
  const [propId, setPropId] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    open: async (id) => {
      setPropId(id);
      setData(null);
      setLoading(true);
      sheetRef.current?.present();
      try {
        const res = await api.propertyIntelligence(id);
        setData(res);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["82%"], []);
  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />,
    []
  );

  const refresh = async () => {
    if (!propId) return;
    Haptics.selectionAsync().catch(() => {});
    setLoading(true);
    try {
      const res = await api.propertyIntelligence(propId);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {}, []);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      enableDynamicSizing={false}
    >
      <BottomSheetView style={styles.wrap}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Neighborhood Intelligence</Text>
            {data?.neighborhood_name && (
              <Text style={styles.subtitle}>{data.neighborhood_name}</Text>
            )}
          </View>
          <Pressable onPress={refresh} hitSlop={10} testID="ns-refresh">
            <Ionicons name="refresh" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {loading || !data ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.red} />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* Lifestyle hero score */}
            <View style={styles.hero}>
              <View style={styles.heroLeft}>
                <Text style={styles.heroValue}>{data.scores.lifestyle}</Text>
                <Text style={styles.heroLabel}>Lifestyle Score</Text>
              </View>
              <View style={styles.heroBars}>
                <BarRow label="Walkability" value={data.scores.walk} tone="#059669" />
                <BarRow label="Schools" value={data.scores.school} tone="#2563EB" />
                <BarRow label="Safety" value={data.scores.safety} tone="#F59E0B" />
                <BarRow label="Infrastructure" value={data.scores.infra} tone="#7C3AED" />
              </View>
            </View>

            {/* Price intelligence */}
            <Card>
              <CardHead icon="pricetags" title="Price Intelligence" />
              <View style={styles.grid}>
                <Stat label="₦/m²" value={formatNaira(data.price.per_sqm)} />
                <Stat label="Area avg" value={formatNaira(data.price.area_avg)} />
                <Stat
                  label="vs area"
                  value={`${data.price.vs_area_pct > 0 ? "+" : ""}${data.price.vs_area_pct}%`}
                  tone={data.price.vs_area_pct < 0 ? "#059669" : "#B45309"}
                />
                <Stat
                  label="Appreciation"
                  value={`${data.price.appreciation_yoy_pct > 0 ? "+" : ""}${data.price.appreciation_yoy_pct}% /yr`}
                  tone="#059669"
                />
              </View>
            </Card>

            {/* Commute */}
            <Card>
              <CardHead icon="car" title="Commute" />
              <View style={styles.commuteRow}>
                <View style={styles.commuteBox}>
                  <Text style={styles.commuteValue}>{data.commute.downtown_km} km</Text>
                  <Text style={styles.commuteLabel}>to downtown</Text>
                </View>
                <View style={styles.commuteBox}>
                  <Text style={styles.commuteValue}>{data.commute.downtown_min} min</Text>
                  <Text style={styles.commuteLabel}>drive · avg traffic</Text>
                </View>
              </View>
            </Card>

            {/* POIs */}
            <Card>
              <CardHead icon="navigate" title="What's nearby" />
              <View style={{ gap: 10 }}>
                <PoiRow icon="school-outline" label="Schools" km={data.poi_km.schools} />
                <PoiRow icon="medkit-outline" label="Hospitals" km={data.poi_km.hospitals} />
                <PoiRow icon="restaurant-outline" label="Restaurants" km={data.poi_km.restaurants} />
                <PoiRow icon="cart-outline" label="Supermarkets" km={data.poi_km.supermarkets} />
                <PoiRow icon="car-sport-outline" label="Fuel stations" km={data.poi_km.fuel} />
              </View>
            </Card>

            {/* Demand signals */}
            <Card>
              <CardHead icon="trending-up" title="Demand & Investment Signals" />
              <View style={styles.grid}>
                <Stat label="Rental demand" value={`${data.scores.rental_demand}/100`} tone={data.scores.rental_demand >= 75 ? "#059669" : "#B45309"} />
                <Stat label="Views (30d)" value={String(data.signals.views_30d)} />
                <Stat label="Favorites (30d)" value={String(data.signals.favorites_30d)} />
                <Stat
                  label="Estimated ROI"
                  value={`${(data.price.appreciation_yoy_pct + data.scores.rental_demand / 20).toFixed(1)}%`}
                  tone="#059669"
                />
              </View>
            </Card>

            <Text style={styles.disclaimer}>
              Estimates are derived from AMASS Property Intelligence — verify with a local expert
              before making a purchase decision.
            </Text>
          </ScrollView>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

NeighborhoodSheet.displayName = "NeighborhoodSheet";

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function CardHead({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.cardHead}>
      <View style={styles.cardHeadIcon}>
        <Ionicons name={icon} size={14} color={colors.text} />
      </View>
      <Text style={styles.cardHeadTitle}>{title}</Text>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function BarRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(2, Math.min(100, value))}%`, backgroundColor: tone }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

function PoiRow({ icon, label, km }: { icon: keyof typeof Ionicons.glyphMap; label: string; km: number }) {
  return (
    <View style={styles.poiRow}>
      <View style={styles.poiIcon}>
        <Ionicons name={icon} size={14} color={colors.textSecondary} />
      </View>
      <Text style={styles.poiLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={styles.poiValue}>{km} km</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { backgroundColor: colors.borderStrong, width: 44, height: 5 },
  wrap: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: colors.textTertiary, fontWeight: "700", marginTop: 2 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },

  hero: {
    flexDirection: "row",
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    marginBottom: 14,
  },
  heroLeft: { width: 96, alignItems: "center", justifyContent: "center", paddingRight: 4 },
  heroValue: { color: "#fff", fontSize: 44, fontWeight: "900", letterSpacing: -1 },
  heroLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },
  heroBars: { flex: 1, gap: 8, justifyContent: "center" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 74, color: "rgba(255,255,255,0.8)", fontSize: 10.5, fontWeight: "700" },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  barValue: { width: 24, textAlign: "right", color: "#fff", fontSize: 11, fontWeight: "800" },

  card: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  cardHeadIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  cardHeadTitle: { fontSize: 13, fontWeight: "800", color: colors.text, letterSpacing: -0.1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    width: "48%",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
  },
  statLabel: { fontSize: 10.5, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  statValue: { fontSize: 15, fontWeight: "900", color: colors.text, marginTop: 3, letterSpacing: -0.3 },

  commuteRow: { flexDirection: "row", gap: 10 },
  commuteBox: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
  },
  commuteValue: { fontSize: 20, fontWeight: "900", color: colors.text, letterSpacing: -0.4 },
  commuteLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "700", marginTop: 2 },

  poiRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  poiIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  poiLabel: { fontSize: 13, color: colors.text, fontWeight: "600" },
  poiValue: { fontSize: 13, color: colors.text, fontWeight: "800" },

  disclaimer: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: "500",
    lineHeight: 15,
    textAlign: "center",
    paddingHorizontal: 12,
    marginTop: 4,
  },
});
