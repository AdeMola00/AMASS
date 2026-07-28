import React, { useCallback, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing, typography, formatNaira } from "@/src/constants/theme";

export type FilterState = {
  listingType?: "buy" | "rent" | "shortlet" | "land" | "commercial";
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  verifiedOnly?: boolean;
};

export type FilterSheetRef = {
  open: () => void;
  close: () => void;
};

const LISTING_TYPES: { key: NonNullable<FilterState["listingType"]>; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "buy", label: "Buy", icon: "key-outline" },
  { key: "rent", label: "Rent", icon: "home-outline" },
  { key: "shortlet", label: "Short Let", icon: "bed-outline" },
  { key: "land", label: "Land", icon: "map-outline" },
  { key: "commercial", label: "Commercial", icon: "business-outline" },
];

const PROPERTY_TYPES = [
  "duplex", "apartment", "bungalow", "penthouse", "terrace", "land", "commercial",
];

const PRICE_PRESETS = [
  { label: "Any", min: undefined, max: undefined },
  { label: "Under ₦50M", min: undefined, max: 50_000_000 },
  { label: "₦50M – ₦150M", min: 50_000_000, max: 150_000_000 },
  { label: "₦150M – ₦500M", min: 150_000_000, max: 500_000_000 },
  { label: "₦500M+", min: 500_000_000, max: undefined },
];

const COUNT_OPTIONS = [0, 1, 2, 3, 4, 5];

export const FilterSheet = forwardRef<
  FilterSheetRef,
  {
    value: FilterState;
    onApply: (state: FilterState) => void;
  }
>(({ value, onApply }, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [draft, setDraft] = useState<FilterState>(value);

  useImperativeHandle(ref, () => ({
    open: () => {
      setDraft(value);
      sheetRef.current?.present();
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["85%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    []
  );

  const apply = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onApply(draft);
    sheetRef.current?.dismiss();
  };

  const reset = () => {
    Haptics.selectionAsync().catch(() => {});
    setDraft({});
  };

  const activeCount = Object.entries(draft).filter(
    ([, v]) => v !== undefined && v !== null && v !== "" && v !== false && v !== 0
  ).length;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      enableDynamicSizing={false}
    >
      <BottomSheetView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Filters</Text>
          <Pressable onPress={reset} hitSlop={10}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Listing type */}
          <Section title="Listing type">
            <View style={styles.chipsGrid}>
              {LISTING_TYPES.map((t) => {
                const active = draft.listingType === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() =>
                      setDraft((d) => ({ ...d, listingType: active ? undefined : t.key }))
                    }
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Ionicons
                      name={t.icon}
                      size={16}
                      color={active ? "#fff" : colors.textSecondary}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* Price */}
          <Section title="Price">
            <View style={styles.chipsGrid}>
              {PRICE_PRESETS.map((p) => {
                const active = draft.minPrice === p.min && draft.maxPrice === p.max;
                return (
                  <Pressable
                    key={p.label}
                    onPress={() =>
                      setDraft((d) => ({ ...d, minPrice: p.min, maxPrice: p.max }))
                    }
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.priceInputs}>
              <View style={styles.priceInputWrap}>
                <Text style={styles.priceLabel}>Min</Text>
                <TextInput
                  value={draft.minPrice ? String(draft.minPrice) : ""}
                  onChangeText={(t) =>
                    setDraft((d) => ({ ...d, minPrice: t ? Number(t.replace(/\D/g, "")) : undefined }))
                  }
                  placeholder="No min"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  style={styles.priceInput}
                />
                {draft.minPrice ? (
                  <Text style={styles.priceHint}>{formatNaira(draft.minPrice)}</Text>
                ) : null}
              </View>
              <View style={styles.priceInputWrap}>
                <Text style={styles.priceLabel}>Max</Text>
                <TextInput
                  value={draft.maxPrice ? String(draft.maxPrice) : ""}
                  onChangeText={(t) =>
                    setDraft((d) => ({ ...d, maxPrice: t ? Number(t.replace(/\D/g, "")) : undefined }))
                  }
                  placeholder="No max"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  style={styles.priceInput}
                />
                {draft.maxPrice ? (
                  <Text style={styles.priceHint}>{formatNaira(draft.maxPrice)}</Text>
                ) : null}
              </View>
            </View>
          </Section>

          {/* Beds / Baths */}
          <Section title="Bedrooms">
            <View style={styles.chipsRow}>
              {COUNT_OPTIONS.map((n) => {
                const active = draft.bedrooms === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setDraft((d) => ({ ...d, bedrooms: active ? undefined : n }))}
                    style={[styles.countChip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {n === 0 ? "Any" : `${n}+`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Bathrooms">
            <View style={styles.chipsRow}>
              {COUNT_OPTIONS.map((n) => {
                const active = draft.bathrooms === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setDraft((d) => ({ ...d, bathrooms: active ? undefined : n }))}
                    style={[styles.countChip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {n === 0 ? "Any" : `${n}+`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Home type">
            <View style={styles.chipsGrid}>
              {PROPERTY_TYPES.map((t) => {
                const active = draft.propertyType === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() =>
                      setDraft((d) => ({ ...d, propertyType: active ? undefined : t }))
                    }
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive, { textTransform: "capitalize" }]}
                    >
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Trust">
            <Pressable
              onPress={() => setDraft((d) => ({ ...d, verifiedOnly: !d.verifiedOnly }))}
              style={[styles.chip, draft.verifiedOnly && styles.chipActive, { alignSelf: "flex-start" }]}
            >
              <Ionicons
                name="shield-checkmark"
                size={16}
                color={draft.verifiedOnly ? "#fff" : colors.textSecondary}
              />
              <Text style={[styles.chipText, draft.verifiedOnly && styles.chipTextActive]}>
                Verified only
              </Text>
            </Pressable>
          </Section>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.applyBtn} onPress={apply} testID="apply-filters-btn">
            <Text style={styles.applyText}>
              Show results{activeCount ? ` (${activeCount})` : ""}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

FilterSheet.displayName = "FilterSheet";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  handle: { backgroundColor: colors.borderStrong, width: 40 },
  container: { flex: 1, paddingHorizontal: spacing.xl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h1, fontSize: 24 },
  resetText: { color: colors.red, fontWeight: "700", fontSize: 14 },
  section: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    gap: spacing.md,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
  chipsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  countChip: {
    minWidth: 54,
    height: 40,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  chipTextActive: { color: "#fff" },
  priceInputs: { flexDirection: "row", gap: 10 },
  priceInputWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  priceLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.5 },
  priceInput: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 2 },
  priceHint: { fontSize: 11, color: colors.red, fontWeight: "700", marginTop: 2 },
  footer: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  applyBtn: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
});
