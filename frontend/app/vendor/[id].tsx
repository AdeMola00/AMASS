import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, MarketplaceItem, Vendor } from "@/src/lib/api";
import { useCart } from "@/src/contexts/cart";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";
import { ProductCard } from "@/src/components/ProductCard";

const COVER_H = 220;

export default function VendorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { add } = useCart();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .marketplaceVendor(id)
      .then((r) => {
        setVendor(r.vendor);
        setItems(r.items);
      })
      .catch(() => setVendor(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }
  if (!vendor) {
    return (
      <View style={styles.center}>
        <Text>Vendor not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="vendor-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Cover */}
        <View style={{ height: COVER_H }}>
          <Image source={{ uri: vendor.cover }} style={styles.cover} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.5)", "transparent"]} style={styles.topScrim} />
          <SafeAreaView edges={["top"]} style={styles.topBar} pointerEvents="box-none">
            <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="vendor-back">
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Pressable style={styles.iconBtn}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </Pressable>
          </SafeAreaView>
        </View>

        {/* Vendor card */}
        <View style={styles.vendorCard}>
          <View style={styles.logoRow}>
            <Image source={{ uri: vendor.logo }} style={styles.logo} contentFit="cover" />
            {vendor.verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.headBody}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{vendor.name}</Text>
              <Text style={styles.tag}>{vendor.tagline}</Text>
              <View style={styles.metaRow}>
                <Ionicons name="star" size={13} color={colors.gold} />
                <Text style={styles.metaText}>
                  {vendor.rating.toFixed(1)} · {vendor.reviews.toLocaleString()} reviews
                </Text>
                <View style={styles.dot} />
                <Ionicons name="location" size={12} color={colors.red} />
                <Text style={styles.metaText}>{vendor.location}</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => setFollowing((v) => !v)}
              style={[styles.followBtn, following && styles.followingBtn]}
              testID="follow-btn"
            >
              <Ionicons name={following ? "checkmark" : "add"} size={16} color={following ? colors.text : "#fff"} />
              <Text style={[styles.followText, following && { color: colors.text }]}>
                {following ? "Following" : "Follow"}
              </Text>
            </Pressable>
            <Pressable style={styles.actionBtn} testID="vendor-chat">
              <Ionicons name="chatbubble-outline" size={18} color={colors.text} />
              <Text style={styles.actionBtnText}>Chat</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} testID="vendor-call">
              <Ionicons name="call-outline" size={18} color={colors.text} />
              <Text style={styles.actionBtnText}>Call</Text>
            </Pressable>
          </View>

          <View style={styles.stats}>
            <StatCell label="Followers" value={vendor.followers.toLocaleString()} />
            <View style={styles.statDivider} />
            <StatCell label="Products" value={String(items.length)} />
            <View style={styles.statDivider} />
            <StatCell label="Since" value={String(vendor.joined_year)} />
          </View>

          <View style={styles.about}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.aboutBody}>{vendor.about}</Text>
          </View>
        </View>

        {/* Products */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Products ({items.length})</Text>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No products yet.</Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(p) => p.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={{ gap: 12 }}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <ProductCard
                  item={item}
                  onPress={() => router.push(`/marketplace/${item.id}` as any)}
                  onAdd={() => add(item.id, 1)}
                />
              )}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  cover: { width: "100%", height: "100%" },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 120 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  vendorCard: {
    marginTop: -40,
    marginHorizontal: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "#fff",
    gap: spacing.md,
    ...shadows.card,
  },
  logoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  logo: { width: 68, height: 68, borderRadius: 16, backgroundColor: colors.surfaceSecondary, borderWidth: 3, borderColor: "#fff" },
  verifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 34,
    marginLeft: -12,
    borderWidth: 2,
    borderColor: "#fff",
  },
  headBody: { flexDirection: "row", alignItems: "flex-start" },
  name: { ...typography.h2, fontSize: 20 },
  tag: { ...typography.caption, color: colors.textTertiary, marginTop: 2, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" },
  metaText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 4 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  followBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  followingBtn: { backgroundColor: colors.surfaceSecondary },
  followText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: { fontSize: 13, fontWeight: "700", color: colors.text },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 16, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  about: { gap: 6 },
  aboutTitle: { fontSize: 13, fontWeight: "800", color: colors.text, letterSpacing: 0.2 },
  aboutBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  section: { padding: spacing.xl, gap: spacing.md },
  sectionTitle: { ...typography.h2, fontSize: 20 },
  emptyText: { color: colors.textTertiary, textAlign: "center", marginTop: 24 },
});
