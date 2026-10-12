import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, SellerProfile } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, ListRow, RowGroup, Screen, ScreenHeader, Skeleton } from "@/src/ui";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";

/** WhatsApp brand green — identical in both themes. */
const WHATSAPP = "#25D366";

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const [res, savedRes] = await Promise.all([api.marketplaceSeller(id), api.marketplaceSavedIds().catch(() => ({ ids: [] }))]);
      setProfile(res.profile);
      setItems(res.items);
      setSavedIds(new Set(savedRes.ids));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSave = async (it: MarketplaceItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = new Set(savedIds);
    if (next.has(it.id)) next.delete(it.id);
    else next.add(it.id);
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

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Seller" backTestID="seller-back" />
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={230} radius={radii.xl} />
          <Skeleton height={84} radius={radii.lg} />
          <Skeleton height={150} radius={radii.lg} />
        </View>
      </Screen>
    );
  }

  if (error || !profile) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Seller" backTestID="seller-back" />
        <EmptyState variant={error ? "error" : "empty"} icon="storefront-outline" title={error ? "Couldn't load seller" : "Seller not found"} body={error ? "Check your connection and try again." : "This seller has no active listings."} actionLabel={error ? "Retry" : "Go back"} onAction={error ? load : () => router.back()} />
      </Screen>
    );
  }

  const rows: MarketplaceItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));

  const typeLabel = profile.seller_type === "dealer" ? "Verified Dealer" : profile.seller_type === "brand" ? "Verified Brand" : profile.seller_verified ? "AMASS Verified" : null;

  return (
    <Screen testID={`seller-${profile.seller_id}`}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Seller" backTestID="seller-back" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(260)} style={[styles.hero, { backgroundColor: colors.surfaceInverse }, shadows.md]}>
          <View style={styles.avatarWrap}>
            {profile.seller_avatar ? (
              <Image source={{ uri: profile.seller_avatar }} style={[styles.avatar, { borderColor: "rgba(255,255,255,0.9)" }]} contentFit="cover" transition={200} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="person" size={36} color="#FFFFFF" />
              </View>
            )}
            {profile.seller_verified ? (
              <View style={[styles.verified, { backgroundColor: colors.success, borderColor: colors.surfaceInverse }]} accessibilityLabel="Verified seller">
                <Ionicons name="shield-checkmark" size={13} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
          <AppText variant="h2" color={colors.textInverse} align="center" style={{ marginTop: 12 }}>
            {profile.seller_name}
          </AppText>
          {typeLabel ? (
            <Badge
              label={typeLabel}
              tone={profile.seller_type === "brand" ? "premium" : "success"}
              icon={profile.seller_type === "dealer" ? "storefront" : profile.seller_type === "brand" ? "ribbon" : "shield-checkmark"}
              style={{ marginTop: 8 }}
            />
          ) : null}
          {profile.seller_bio ? (
            <AppText variant="bodySm" color="rgba(255,255,255,0.72)" align="center" numberOfLines={3} style={{ marginTop: 10, maxWidth: 320 }}>
              {profile.seller_bio}
            </AppText>
          ) : null}
          <View style={styles.contactRow}>
            <Button label="Call" variant="inverse" iconLeft="call" onPress={call} disabled={!profile.seller_phone} testID="seller-call" style={{ flex: 1 }} />
            <Button label="WhatsApp" iconLeft="logo-whatsapp" onPress={whatsapp} disabled={!profile.seller_whatsapp} testID="seller-whatsapp" style={{ flex: 1, backgroundColor: WHATSAPP }} />
          </View>
        </Animated.View>

        <Card elevation="xs" style={styles.statsCard}>
          <Stat value={profile.listings_count.toString()} label="Listings" />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <Stat value={`${profile.seller_rating.toFixed(1)}★`} label={`${profile.seller_reviews} reviews`} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <Stat value={`${profile.seller_response_rate}%`} label="Responds" />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <Stat value={`${profile.seller_response_time_hours}h`} label="Avg reply" />
        </Card>

        <RowGroup>
          <ListRow icon="location-outline" label="Location" value={profile.city || "—"} />
          <ListRow icon="calendar-outline" label="Joined" value={`${profile.seller_joined_year}`} />
          <ListRow icon="checkmark-done-outline" label="Items sold" value={`${profile.items_sold}`} last />
        </RowGroup>

        <View style={styles.sectionHead}>
          <AppText variant="h3">Current listings</AppText>
          <AppText variant="caption" tone="tertiary" tabular>
            {items.length} active
          </AppText>
        </View>

        {rows.length === 0 ? (
          <EmptyState compact icon="pricetags-outline" title="No active listings" body="This seller hasn't listed anything yet." />
        ) : (
          <View style={{ gap: 12 }}>
            {rows.map((r, i) => (
              <View key={i} style={styles.gridRow}>
                {r.map((it) => (
                  <ClassifiedCard key={it.id} item={it} variant="grid" onPress={() => router.push(`/marketplace/${it.id}` as any)} onFavorite={() => toggleSave(it)} favorited={savedIds.has(it.id)} />
                ))}
                {r.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="title" tabular>
        {value}
      </AppText>
      <AppText variant="micro" tone="tertiary" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[5], alignItems: "center" },
  avatarWrap: { position: "relative" },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3 },
  verified: { position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  contactRow: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  statsCard: { flexDirection: "row", paddingVertical: 14, paddingHorizontal: 8 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 2 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  gridRow: { flexDirection: "row", gap: 12 },
});
