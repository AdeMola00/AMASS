import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/constants/theme";
import { LegendDot, PROPERTY_TYPE_LEGEND } from "@/src/components/PropertyMarker";

export type MapLayer = "standard" | "satellite" | "hybrid" | "terrain";

const LAYERS: {
  key: MapLayer;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
}[] = [
  { key: "standard", label: "Standard", icon: "map-outline", hint: "AMASS minimal style" },
  { key: "satellite", label: "Satellite", icon: "planet-outline", hint: "Aerial photography" },
  { key: "hybrid", label: "Hybrid", icon: "layers-outline", hint: "Satellite + labels" },
  { key: "terrain", label: "Terrain", icon: "trail-sign-outline", hint: "Elevation + landform" },
];

export type LayerPickerRef = {
  open: () => void;
  close: () => void;
};

export const LayerPickerSheet = forwardRef<
  LayerPickerRef,
  {
    layer: MapLayer;
    onLayerChange: (l: MapLayer) => void;
  }
>(({ layer, onLayerChange }, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [selected, setSelected] = useState<MapLayer>(layer);

  useImperativeHandle(ref, () => ({
    open: () => {
      setSelected(layer);
      sheetRef.current?.present();
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["70%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    []
  );

  const pick = (k: MapLayer) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(k);
    onLayerChange(k);
  };

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
        <Text style={styles.title}>Map Style</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          <View style={styles.grid}>
            {LAYERS.map((l) => (
              <Pressable
                key={l.key}
                onPress={() => pick(l.key)}
                style={[styles.layerCard, selected === l.key && styles.layerCardActive]}
                testID={`layer-${l.key}`}
              >
                <View
                  style={[
                    styles.iconWrap,
                    selected === l.key && { backgroundColor: colors.ink },
                  ]}
                >
                  <Ionicons
                    name={l.icon}
                    size={22}
                    color={selected === l.key ? "#fff" : colors.text}
                  />
                </View>
                <Text style={[styles.layerLabel, selected === l.key && { color: colors.ink }]}>
                  {l.label}
                </Text>
                <Text style={styles.layerHint} numberOfLines={2}>
                  {l.hint}
                </Text>
                {selected === l.key && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={11} color="#fff" />
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.legendTitle}>Property Type Legend</Text>
            <View style={styles.legendGrid}>
              {PROPERTY_TYPE_LEGEND.map((l) => (
                <View key={l.slug} style={styles.legendItem} testID={`legend-${l.slug}`}>
                  <LegendDot slug={l.slug} />
                  <Text style={styles.legendText}>{l.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

LayerPickerSheet.displayName = "LayerPickerSheet";

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { backgroundColor: colors.borderStrong, width: 44, height: 5 },
  wrap: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: 4 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3, marginBottom: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  layerCard: {
    width: "48%",
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
    position: "relative",
  },
  layerCardActive: {
    borderColor: colors.ink,
    backgroundColor: colors.surfaceSecondary,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  layerLabel: { fontSize: 14, fontWeight: "800", color: colors.text, letterSpacing: -0.2, marginTop: 4 },
  layerHint: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  checkBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },

  legendTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "48%",
    paddingVertical: 6,
  },
  legendText: { fontSize: 12, color: colors.text, fontWeight: "700" },
});
