import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, SellerProfile } from "@/src/lib/api";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [res, savedRes] = await Promise.all([
          api.marketplaceSeller(id),
          api.marketplaceSavedIds().catch(() => ({ ids: [] })),
        ]);
        setProfile(res.profile);
        setItems(res.items);
        setSavedIds(new Set(savedRes.ids));
      } catch {
        Alert.alert("Not found", "This seller has no active listings.");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const toggleSave = async (it: MarketplaceItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = new Set(savedIds);
    if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
    setSavedIds(next);
    try {
      await api.marketplaceToggleSave(it.id);
    } catch {}
  };

  const call = () => profile?.seller_phone && Linking.openURL(`tel:${profile.seller_phone}`).catch(() => {});
  const whatsapp = () => {
    if (!profile?.seller_whatsapp) return;
    const num = profile.seller_whatsapp.replace(/[^0-9]/g, "");
    Linking.openURL(`https://wa.me/${num}`).catch(() => {});
  };

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </SafeAreaView>
    );
  }

  const rows: MarketplaceItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));

  return (
    <View style={styles.container} testID={`seller-${profile.seller_id}`}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.headerBg, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} testID="seller-back">
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>Seller</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.avatarWrap}>
            {profile.seller_avatar ? (
              <Image source={{ uri: profile.seller_avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="person" size={38} color={colors.textTertiary} />
              </View>
            )}
            {profile.seller_verified && (
              <View style={styles.verified}>
                <Ionicons name="shield-checkmark" size={14} color="#fff" />
              </View>
            )}
          </View>

          <Text style={styles.name}>{profile.seller_name}</Text>
          <View style={styles.badgesRow}>
            {profile.seller_type !== "individual" && (
              <View style={[styles.typeBadge, profile.seller_type === "brand" && { backgroundColor: "rgba(124,58,237,0.25)" }]}>
                <Ionicons
                  name={profile.seller_type === "dealer" ? "storefront" : "ribbon"}
                  size={12}
                  color={profile.seller_type === "brand" ? "#C4B5FD" : "#fff"}
                />
                <Text style={[styles.typeBadgeText, profile.seller_type === "brand" && { color: "#EDE9FE" }]}>
                  {profile.seller_type === "dealer" ? "Verified Dealer" : "Verified Brand"}
                </Text>
              </View>
            )}
            {profile.seller_verified && profile.seller_type === "individual" && (
              <View style={styles.typeBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
                <Text style={styles.typeBadgeText}>AMASS Verified</Text>
              </View>
            )}
          </View>
          {!!profile.seller_bio && (
            <Text style={styles.bio} numberOfLines={3}>{profile.seller_bio}</Text>
          )}

          <View style={styles.contactRow}>
            <Pressable onPress={call} style={[styles.contactBtn, { backgroundColor: "#fff" }]} testID="seller-call">
              <Ionicons name="call" size={16} color={colors.text} />
              <Text style={styles.contactText}>Call</Text>
            </Pressable>
            <Pressable onPress={whatsapp} style={[styles.contactBtn, { backgroundColor: "#25D366", borderColor: "#25D366" }]} testID="seller-whatsapp">
              <Ionicons name="logo-whatsapp" size={16} color="#fff" />
              <Text style={[styles.contactText, { color: "#fff" }]}>WhatsApp</Text>
            </Pressable>
          </View>
        </View>

        {/* Stats card */}
        <View style={styles.statsCard}>
          <Stat value={profile.listings_count.toString()} label="Listings" />
          <View style={styles.statDivider} />
          <Stat value={`${profile.seller_rating.toFixed(1)}★`} label={`${profile.seller_reviews} reviews`} />
          <View style={styles.statDivider} />
          <Stat value={`${profile.seller_response_rate}%`} label="Responds" />
          <View style={styles.statDivider} />
          <Stat value={`${profile.seller_response_time_hours}h`} label="Avg reply" />
        </View>

        {/* Info list */}
        <View style={styles.infoBlock}>
          <InfoRow icon="location-outline" label="Location" value={profile.city || "—"} />
          <InfoRow icon="calendar-outline" label="Joined" value={`${profile.seller_joined_year}`} />
          <InfoRow icon="checkmark-done-outline" label="Items sold" value={`${profile.items_sold}`} />
        </View>

        {/* Listings */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Current listings</Text>
          <Text style={styles.sectionSub}>{items.length} active</Text>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: 12 }}>
          {rows.map((r, i) => (
            <View key={i} style={styles.gridRow}>
              {r.map((it) => (
                <ClassifiedCard
                  key={it.id}
                  item={it}
                  variant="grid"
                  onPress={() => router.push(`/marketplace/${it.id}` as any)}
                  onFavorite={() => toggleSave(it)}
                  favorited={savedIds.has(it.id)}
                />
              ))}
              {r.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof import("@react-native-vector-icons/ionicons").default.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name={icon} size={16} color={colors.textSecondary} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  headerBg: {
    backgroundColor: colors.ink,
    paddingBottom: 24,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  avatarWrap: { position: "relative" },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
  verified: {
    position: "absolute", right: -2, bottom: -2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "#059669",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.ink,
  },
  name: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 10, letterSpacing: -0.3 },
  badgesRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  typeBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  typeBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  bio: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 18,
    maxWidth: 320,
  },
  contactRow: { flexDirection: "row", gap: 8, marginTop: 14, width: "100%" },
  contactBtn: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  contactText: { fontSize: 13, fontWeight: "800", color: colors.text },
  statsCard: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: -16,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    paddingVertical: 14,
    ...shadows.card,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 15, fontWeight: "900", color: colors.text, letterSpacing: -0.3 },
  statLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "700", marginTop: 2, letterSpacing: 0.3 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  infoBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: 4 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  infoLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  infoValue: { fontSize: 13, color: colors.text, fontWeight: "800" },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  sectionSub: { fontSize: 11, color: colors.textTertiary, fontWeight: "700" },
  gridRow: { flexDirection: "row", gap: 12 },
});
