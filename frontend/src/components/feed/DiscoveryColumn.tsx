/**
 * Discovery columns woven into the Feed every N posts — FIXA Pros near you · Brands & Products · Homes near you.
 * Horizontal rails of compact cards; every card routes to the real surface (FIXA profile, Shop product, listing).
 */
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { feedApi, mediaUrl, naira, type BrandColumnItem, type FeedRow, type FixaColumnItem, type HomeColumnItem } from "@/src/lib/feedApi";
import { useTheme } from "@/src/theme";
import { boldFont, radii } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, PressableScale, useToast, type IconName } from "@/src/ui";

type Column = Exclude<FeedRow, { kind: "post" }>;

export function DiscoveryColumn({ row, gutter = 16 }: { row: Column; gutter?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const accent = row.kind === "fixa" ? colors.fix : row.kind === "brands" ? colors.market : colors.brand;
  const icon: IconName = row.kind === "fixa" ? "construct" : row.kind === "brands" ? "storefront" : "home";
  return (
    <View style={styles.wrap} testID={`feed-column-${row.kind}`}>
      <View style={[styles.head, { paddingHorizontal: gutter }]}>
        <View style={[styles.headIcon, { backgroundColor: accent }]}>
          <Ionicons name={icon} size={15} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={styles.title} numberOfLines={1}>
            {row.title}
          </AppText>
          <AppText variant="micro" tone="tertiary" numberOfLines={1}>
            {row.subtitle}
          </AppText>
        </View>
        <Pressable onPress={() => router.push(row.see_all as any)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2 }} accessibilityRole="button" accessibilityLabel={`See all ${row.title}`} testID={`feed-column-seeall-${row.kind}`}>
          <AppText variant="caption" color={colors.brand} style={{ fontFamily: boldFont.bold }}>
            See all
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 10 }}>
        {row.kind === "fixa" ? row.items.map((it) => <FixaCard key={it.id} it={it} />) : row.kind === "brands" ? row.items.map((it) => <BrandCard key={it.product_id} it={it} />) : row.items.map((it) => <HomeCard key={it.id} it={it} />)}
      </ScrollView>
    </View>
  );
}

function FixaCard({ it }: { it: FixaColumnItem }) {
  const router = useRouter();
  const { colors, shadows, isDark } = useTheme();
  return (
    <PressableScale onPress={() => router.push(`/fixa/${it.id}` as any)} style={[styles.card, { width: 168, backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} accessibilityRole="button" accessibilityLabel={`${it.display_name}, ${it.category}, rated ${it.rating}`} testID={`feed-fixa-${it.id}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Avatar name={it.display_name} uri={it.image} size={40} verified={it.verified} tone="soft" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="caption" style={{ fontFamily: boldFont.bold }} numberOfLines={1}>
            {it.display_name}
          </AppText>
          <AppText variant="micro" color={colors.fixText} numberOfLines={1}>
            {it.category}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
        <Ionicons name="star" size={12} color={colors.warning} />
        <AppText variant="micro" tabular style={{ fontFamily: boldFont.semibold }}>
          {(it.rating ?? 0).toFixed(1)}
        </AppText>
        <AppText variant="micro" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
          ({it.reviews ?? 0}) · {it.area || it.city}
        </AppText>
      </View>
      {it.verified ? <Badge label="FIXA Verified" tone="fix" size="xs" style={{ alignSelf: "flex-start", marginTop: 8 }} /> : null}
      <View style={[styles.cta, { backgroundColor: colors.fix }]}>
        <AppText variant="micro" color="#fff" style={{ fontFamily: boldFont.bold }}>
          View & book
        </AppText>
      </View>
    </PressableScale>
  );
}

function BrandCard({ it }: { it: BrandColumnItem }) {
  const router = useRouter();
  const toast = useToast();
  const { colors, shadows, isDark } = useTheme();
  const [following, setFollowing] = React.useState(it.brand.following);
  const follow = async () => {
    setFollowing((f) => !f);
    try {
      const r = await feedApi.follow(it.brand.id, "brand");
      setFollowing(r.following);
      toast.success(r.following ? `Following ${it.brand.name}` : "Unfollowed");
    } catch (e: any) {
      setFollowing((f) => !f);
      toast.error("Couldn't follow", e?.message ?? "Try again");
    }
  };
  return (
    <PressableScale onPress={() => router.push(`/shop/product/${it.product_id}` as any)} style={[styles.card, { width: 168, padding: 0, backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} accessibilityRole="button" accessibilityLabel={`${it.name} from ${it.brand.name}, ${naira(it.price)}`} testID={`feed-brand-${it.product_id}`}>
      <View style={[styles.productImg, { backgroundColor: colors.surfaceAlt }]}>
        {it.image ? <Image source={{ uri: mediaUrl(it.image) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="cube-outline" size={28} color={colors.textTertiary} />}
        {it.promo?.label ? (
          <View style={[styles.promoTag, { backgroundColor: colors.brand }]}>
            <AppText variant="micro" color="#fff" style={{ fontFamily: boldFont.bold }}>
              {it.promo.label}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={{ padding: 10, gap: 4 }}>
        <AppText tabular style={styles.price}>
          {naira(it.price)}
        </AppText>
        <AppText variant="micro" numberOfLines={2} style={{ minHeight: 30 }}>
          {it.name}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {it.brand.logo ? <Image source={{ uri: mediaUrl(it.brand.logo) }} style={{ width: 16, height: 16, borderRadius: 4 }} contentFit="contain" /> : null}
          <AppText variant="micro" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {it.brand.name}
          </AppText>
          <Pressable onPress={follow} hitSlop={8} accessibilityRole="button" accessibilityLabel={following ? `Unfollow ${it.brand.name}` : `Follow ${it.brand.name}`} testID={`feed-brand-follow-${it.brand.id}`}>
            <Ionicons name={following ? "checkmark-circle" : "add-circle-outline"} size={18} color={following ? colors.success : colors.brand} />
          </Pressable>
        </View>
      </View>
    </PressableScale>
  );
}

function HomeCard({ it }: { it: HomeColumnItem }) {
  const router = useRouter();
  const { colors, shadows, isDark } = useTheme();
  return (
    <PressableScale onPress={() => router.push(`/property/${it.id}` as any)} style={[styles.card, { width: 200, padding: 0, backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} accessibilityRole="button" accessibilityLabel={`${it.title}, ${naira(it.price)}`} testID={`feed-home-${it.id}`}>
      <View style={[styles.homeImg, { backgroundColor: colors.surfaceAlt }]}>
        {it.image ? <Image source={{ uri: mediaUrl(it.image) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="home-outline" size={28} color={colors.textTertiary} />}
        <View style={styles.homeBadges}>
          {it.verified ? <Badge label="Verified" tone="success" size="xs" /> : null}
          {it.promoted ? <Badge label="Promoted" tone="premium" size="xs" /> : null}
        </View>
      </View>
      <View style={{ padding: 10, gap: 2 }}>
        <AppText tabular style={styles.price}>
          {naira(it.price)}
          {it.listing_type === "rent" ? <AppText variant="micro" tone="tertiary"> / yr</AppText> : null}
        </AppText>
        <AppText variant="micro" numberOfLines={1}>
          {it.title}
        </AppText>
        <AppText variant="micro" tone="tertiary" numberOfLines={1}>
          {[it.bedrooms ? `${it.bedrooms} bed` : null, it.property_type, it.city].filter(Boolean).join(" · ")}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: boldFont.black, fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
  card: { borderRadius: radii.lg, borderWidth: 1, padding: 10, overflow: "hidden" },
  cta: { marginTop: 10, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  productImg: { height: 120, alignItems: "center", justifyContent: "center" },
  promoTag: { position: "absolute", left: 8, top: 8, paddingHorizontal: 7, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  price: { fontFamily: boldFont.black, fontSize: 16, lineHeight: 21, letterSpacing: -0.3 },
  homeImg: { height: 118, alignItems: "center", justifyContent: "center" },
  homeBadges: { position: "absolute", left: 8, top: 8, flexDirection: "row", gap: 4 },
});
