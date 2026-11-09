import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { TKey } from "@/src/i18n";
import { ROLE_META } from "@/src/roles";
import { usesNativeTabs } from "@/src/navigation";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Avatar, ScreenHeader, tap, Tile, Tone } from "@/src/ui";
import { WeekCard } from "@/src/WeekCard";


type T = { key: string; label: TKey; icon: any; count?: number; tone: Tone; href: string };

export default function Home() {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const { t } = useSettings();
  const { me, brand, roles, role, setRole, refresh, kind } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const c = me?.counts || {};
  const tiles: T[] =
    role === "agent"
      ? [
          { key: "visits", label: "tile_visits", icon: "calendar", count: c.agent_viewings_waiting, tone: "brand", href: "/work?tab=visits" },
          { key: "messages", label: "tile_messages", icon: "chatbubbles", count: c.unread_messages, tone: "brand", href: "/messages" },
          { key: "new", label: "tile_new_listing", icon: "add-circle", tone: "gold", href: "/listing/new" },
          { key: "homes", label: "tile_my_homes", icon: "home", count: c.agent_listings, tone: "neutral", href: "/work?tab=homes" },
        ]
      : role === "seller"
        ? [
            { key: "offers", label: "tile_offers", icon: "cash", count: c.seller_offers_open, tone: "brand", href: "/work?tab=offers" },
            { key: "messages", label: "tile_messages", icon: "chatbubbles", count: c.unread_messages, tone: "brand", href: "/messages" },
            { key: "new", label: "tile_add_item", icon: "camera", tone: "gold", href: "/item/new" },
            { key: "items", label: "tile_my_items", icon: "pricetags", count: c.seller_items, tone: "neutral", href: "/work?tab=items" },
          ]
        : role === "fixa"
          ? [
              { key: "new", label: "tile_new_jobs", icon: "notifications", count: c.fixa_jobs_new, tone: "brand", href: "/work?tab=new" },
              { key: "active", label: "tile_active_jobs", icon: "hammer", count: c.fixa_jobs_active, tone: "success", href: "/work?tab=accepted" },
              { key: "messages", label: "tile_messages", icon: "chatbubbles", count: c.unread_messages, tone: "brand", href: "/messages" },
              { key: "alerts", label: "tile_alerts", icon: "megaphone", count: c.unread_alerts, tone: "neutral", href: "/messages?tab=alerts" },
            ]
          : role === "brand"
            ? [
                { key: "new", label: "tile_add_product", icon: "add-circle", tone: "gold", href: "/product/edit" },
                { key: "products", label: "tile_products", icon: "cube", count: brand?.brand?.product_count, tone: "neutral", href: "/work" },
              ]
            : [];

  const waiting = tiles.filter((x) => x.tone !== "gold" && x.tone !== "neutral").reduce((n, x) => n + (x.count || 0), 0);
  const name = kind === "brand" ? brand?.brand?.name : me?.user?.full_name?.split(" ")[0];
  const summary = tiles.filter((x) => x.count).map((x) => `${t(x.label)}: ${x.count}`).join(". ");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={t("hello", { name: name || "" })} guide="guide_home" extra={summary} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: bottomChrome + space.xl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            tintColor={colors.brandPrimary}
          />
        }
      >
        {roles.length > 1 ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.muted }}>{t("role_switch")}</Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {roles.map((r) => {
                const on = r === role;
                return (
                  <Pressable
                    key={r}
                    testID={`role-switch-${r}`}
                    onPress={() => {
                      tap();
                      setRole(r);
                    }}
                    style={{ flex: 1, minHeight: 64, borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.surfaceInverse : colors.border, backgroundColor: on ? colors.surfaceInverse : colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 2, padding: 6 }}
                  >
                    <Ionicons name={ROLE_META[r].icon} size={24} color={on ? colors.onSurfaceInverse : colors.onSurface} />
                    <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 14, color: on ? colors.onSurfaceInverse : colors.onSurface }}>{t(ROLE_META[r].label)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View testID="home-status-card" style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: waiting ? colors.brandPrimary : colors.success }}>
          {kind === "brand" ? (
            <Avatar name={brand?.brand?.name} uri={brand?.brand?.logo_url} size={56} />
          ) : (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={waiting ? "alert" : "checkmark"} size={34} color={waiting ? colors.brandPrimary : colors.success} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.onBrandPrimary, opacity: 0.9 }}>{role ? t(ROLE_META[role].label) : ""}</Text>
            <Text testID="home-status-text" style={{ fontFamily: fonts.display, fontSize: 24, color: colors.onBrandPrimary, lineHeight: 30 }}>
              {waiting ? `${t("needs_you")}: ${waiting}` : t("all_done")}
            </Text>
          </View>
        </View>

        {role === "fixa" && me?.fixa?.status === "pending" ? (
          <View testID="fixa-pending-banner" style={{ flexDirection: "row", gap: space.md, alignItems: "center", padding: space.lg, borderRadius: radius.md, backgroundColor: colors.brandTertiary }}>
            <Ionicons name="time" size={30} color={colors.onBrandTertiary} />
            <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.onBrandTertiary }}>{t("fixa_pending")}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
          {tiles.map((x, i) => (
            <Animated.View key={x.key} entering={FadeInDown.delay(i * 70)} style={{ width: "47.5%", flexGrow: 1 }}>
              <Tile label={t(x.label)} icon={x.icon} count={x.count} tone={x.tone} onPress={() => router.push(x.href as any)} testID={`home-tile-${x.key}`} wide />
            </Animated.View>
          ))}
        </View>

        {role && role !== "brand" ? <WeekCard role={role} /> : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs }}>
          <Ionicons name="hand-left" size={20} color={colors.muted} />
          <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.muted }}>{t("hold_to_hear")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
