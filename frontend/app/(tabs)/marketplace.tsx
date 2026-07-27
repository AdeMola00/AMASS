import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, MarketplaceItem } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

const { width } = Dimensions.get("window");
const CARD_W = (width - spacing.xl * 2 - spacing.md) / 2;

type Tab = "construction" | "home" | "services";

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "construction", label: "Construction", icon: "construct" },
  { key: "services", label: "Services", icon: "briefcase" },
];

export default function Marketplace() {
  const [tab, setTab] = useState<Tab>("home");
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .marketplace(tab === "services" ? "construction" : tab)
      .then((list) => {
        if (tab === "services") {
          setItems(list.filter((i) => i.subcategory === "Professionals"));
        } else if (tab === "construction") {
          setItems(list.filter((i) => i.subcategory !== "Professionals"));
        } else {
          setItems(list);
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [tab]);

  const subcategories = useMemo(() => {
    const set = new Set(items.map((i) => i.subcategory));
    return Array.from(set);
  }, [items]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="marketplace-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>Marketplace</Text>
        <Text style={styles.subtitle}>
          Everything you need to buy, build and furnish your property.
        </Text>
      </View>

      <View style={styles.segmented}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.segment, tab === t.key && styles.segmentActive]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setTab(t.key);
            }}
            testID={`market-tab-${t.key}`}
          >
            <Ionicons
              name={t.icon}
              size={16}
              color={tab === t.key ? "#fff" : colors.textSecondary}
            />
            <Text style={[styles.segmentText, tab === t.key && styles.segmentTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {subcategories.length > 0 && (
        <FlatList
          horizontal
          data={subcategories}
          keyExtractor={(s) => s}
          contentContainerStyle={styles.subRow}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.subChip}>
              <Text style={styles.subChipText}>{item}</Text>
            </View>
          )}
        />
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.red} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.xl }}
          contentContainerStyle={{ gap: spacing.md, paddingBottom: 140, paddingTop: 8 }}
          renderItem={({ item }) => <ItemCard item={item} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No items yet in this category.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function ItemCard({ item }: { item: MarketplaceItem }) {
  return (
    <View style={[styles.card, { width: CARD_W }, shadows.soft]}>
      <Image source={{ uri: item.image }} style={styles.cardImg} contentFit="cover" />
      <View style={styles.cardBody}>
        <Text style={styles.cardSub}>{item.subcategory.toUpperCase()}</Text>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {item.name}
        </Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={12} color={colors.gold} />
          <Text style={styles.ratingText}>
            {item.rating.toFixed(1)} · {item.reviews}
          </Text>
        </View>
        <Text style={styles.cardPrice}>{formatNaira(item.price)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.xl, paddingTop: spacing.md, gap: 6 },
  h1: { ...typography.display },
  subtitle: { ...typography.body, color: colors.textTertiary, lineHeight: 22 },
  segmented: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  segmentActive: {
    backgroundColor: colors.text,
  },
  segmentText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  segmentTextActive: { color: "#fff" },
  subRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  subChip: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  subChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  cardImg: { width: "100%", height: 140 },
  cardBody: { padding: spacing.md, gap: 4 },
  cardSub: { fontSize: 10, fontWeight: "700", color: colors.emerald, letterSpacing: 0.6 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: colors.text, minHeight: 36 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  cardPrice: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 },
  empty: { textAlign: "center", marginTop: 60, color: colors.textTertiary },
});
