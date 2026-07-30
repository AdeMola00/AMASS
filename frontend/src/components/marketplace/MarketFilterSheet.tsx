import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/constants/theme";
import type { MarketCategory } from "@/src/lib/api";

export type MarketFilterState = {
  category?: string;
  subcategory?: string;
  condition?: "new" | "used" | "refurbished" | "for_parts";
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  sellerType?: "individual" | "dealer" | "brand";
  verifiedOnly?: boolean;
  boostedOnly?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "views" | "saves";
};

export type MarketFilterSheetRef = {
  open: () => void;
  close: () => void;
};

const CONDITIONS: { key: NonNullable<MarketFilterState["condition"]>; label: string }[] = [
  { key: "new", label: "New" },
  { key: "used", label: "Used" },
  { key: "refurbished", label: "Refurbished" },
  { key: "for_parts", label: "For Parts" },
];

const CITIES = [
  "Lagos - Lekki", "Lagos - Ikeja", "Lagos - Yaba", "Lagos - Victoria Island", "Lagos - Ajah",
  "Abuja - Maitama", "Abuja - Wuse 2", "Abuja - Gwarinpa", "Port Harcourt", "Ibadan", "Kano",
];

const SELLER_TYPES: { key: "individual" | "dealer" | "brand"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "individual", label: "Individual", icon: "person-outline" },
  { key: "dealer", label: "Dealer", icon: "storefront-outline" },
  { key: "brand", label: "Brand", icon: "ribbon-outline" },
];

const SORT_OPTIONS: { key: NonNullable<MarketFilterState["sort"]>; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "newest", label: "Newest", icon: "time-outline" },
  { key: "price_asc", label: "Lowest Price", icon: "arrow-down" },
  { key: "price_desc", label: "Highest Price", icon: "arrow-up" },
  { key: "views", label: "Most Viewed", icon: "eye-outline" },
  { key: "saves", label: "Most Saved", icon: "heart-outline" },
];

const PRICE_PRESETS = [
  { label: "Any", min: undefined, max: undefined },
  { label: "< ₦100k", min: undefined, max: 100_000 },
  { label: "₦100k – ₦500k", min: 100_000, max: 500_000 },
  { label: "₦500k – ₦2M", min: 500_000, max: 2_000_000 },
  { label: "₦2M – ₦10M", min: 2_000_000, max: 10_000_000 },
  { label: "₦10M+", min: 10_000_000, max: undefined },
];

export const MarketFilterSheet = forwardRef<
  MarketFilterSheetRef,
  { value: MarketFilterState; categories: MarketCategory[]; onApply: (s: MarketFilterState) => void }
>(({ value, categories, onApply }, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [draft, setDraft] = useState<MarketFilterState>(value);

  useImperativeHandle(ref, () => ({
    open: () => {
      setDraft(value);
      sheetRef.current?.present();
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["88%"], []);

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

  const activeCount = Object.values(draft).filter(
    (v) => v !== undefined && v !== "" && v !== false
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
          <Pressable onPress={reset} hitSlop={10} testID="filter-reset">
            <Text style={styles.reset}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Sort */}
          <Section title="Sort by">
            <View style={styles.chipsWrap}>
              {SORT_OPTIONS.map((o) => (
                <Chip
                  key={o.key}
                  label={o.label}
                  icon={o.icon}
                  active={draft.sort === o.key}
                  onPress={() =>
                    setDraft({ ...draft, sort: draft.sort === o.key ? undefined : o.key })
                  }
                />
              ))}
            </View>
          </Section>

          {/* Category */}
          <Section title="Category">
            <View style={styles.chipsWrap}>
              {categories.map((c) => (
                <Chip
                  key={c.key}
                  label={`${c.emoji || ""} ${c.label}`}
                  active={draft.category === c.key}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      category: draft.category === c.key ? undefined : c.key,
                      subcategory: undefined,
                    })
                  }
                />
              ))}
            </View>
          </Section>

          {/* Condition */}
          <Section title="Condition">
            <View style={styles.chipsWrap}>
              {CONDITIONS.map((c) => (
                <Chip
                  key={c.key}
                  label={c.label}
                  active={draft.condition === c.key}
                  onPress={() =>
                    setDraft({ ...draft, condition: draft.condition === c.key ? undefined : c.key })
                  }
                />
              ))}
            </View>
          </Section>

          {/* Price */}
          <Section title="Price range">
            <View style={styles.chipsWrap}>
              {PRICE_PRESETS.map((p) => {
                const isActive = draft.minPrice === p.min && draft.maxPrice === p.max;
                return (
                  <Chip
                    key={p.label}
                    label={p.label}
                    active={isActive}
                    onPress={() => setDraft({ ...draft, minPrice: p.min, maxPrice: p.max })}
                  />
                );
              })}
            </View>
            <View style={styles.priceRow}>
              <PriceInput
                placeholder="Min ₦"
                value={draft.minPrice}
                onChange={(v) => setDraft({ ...draft, minPrice: v })}
              />
              <Text style={styles.priceDash}>—</Text>
              <PriceInput
                placeholder="Max ₦"
                value={draft.maxPrice}
                onChange={(v) => setDraft({ ...draft, maxPrice: v })}
              />
            </View>
          </Section>

          {/* City */}
          <Section title="Location">
            <View style={styles.chipsWrap}>
              {CITIES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={draft.city === c}
                  onPress={() => setDraft({ ...draft, city: draft.city === c ? undefined : c })}
                />
              ))}
            </View>
          </Section>

          {/* Seller Type */}
          <Section title="Seller type">
            <View style={styles.chipsWrap}>
              {SELLER_TYPES.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  icon={s.icon}
                  active={draft.sellerType === s.key}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      sellerType: draft.sellerType === s.key ? undefined : s.key,
                    })
                  }
                />
              ))}
            </View>
          </Section>

          {/* Toggles */}
          <Section title="Trust & visibility">
            <ToggleRow
              label="Verified sellers only"
              value={!!draft.verifiedOnly}
              onValue={(v) => setDraft({ ...draft, verifiedOnly: v || undefined })}
              icon="shield-checkmark"
            />
            <ToggleRow
              label="Boosted listings only"
              value={!!draft.boostedOnly}
              onValue={(v) => setDraft({ ...draft, boostedOnly: v || undefined })}
              icon="flash"
            />
          </Section>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.applyBtn} onPress={apply} testID="filter-apply">
            <Text style={styles.applyText}>
              Show results{activeCount > 0 ? ` · ${activeCount} filter${activeCount === 1 ? "" : "s"}` : ""}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

MarketFilterSheet.displayName = "MarketFilterSheet";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon && (
        <Ionicons name={icon} size={13} color={active ? "#fff" : colors.textSecondary} />
      )}
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function PriceInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <TextInput
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType="numeric"
      value={value !== undefined ? String(value) : ""}
      onChangeText={(t) => onChange(t ? parseInt(t.replace(/\D/g, "")) || undefined : undefined)}
      style={styles.priceInput}
    />
  );
}

function ToggleRow({
  label,
  value,
  onValue,
  icon,
}: {
  label: string;
  value: boolean;
  onValue: (v: boolean) => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onValue(!value);
      }}
      style={styles.toggleRow}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {icon && <Ionicons name={icon} size={16} color={colors.textSecondary} />}
        <Text style={styles.toggleLabel}>{label}</Text>
      </View>
      <View style={[styles.toggle, value && { backgroundColor: colors.ink }]}>
        <View style={[styles.toggleKnob, value && { alignSelf: "flex-end" }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { backgroundColor: colors.borderStrong, width: 44, height: 5 },
  container: { flex: 1, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.md,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  reset: { fontSize: 13, color: colors.red, fontWeight: "800" },
  section: { paddingVertical: spacing.md },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.text },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  priceDash: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
  priceInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  toggleLabel: { fontSize: 14, color: colors.text, fontWeight: "600" },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    padding: 2,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  applyBtn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
});
