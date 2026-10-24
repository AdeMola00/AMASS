/**
 * Tabs shell + AMASS floating tab bar.
 * A softly elevated pill (not edge-to-edge) that floats above content: five evenly spaced
 * tabs, the active one marked by an AMASS-red icon on a soft red capsule that slides between
 * tabs, ink label in bold; inactive tabs stay legible in secondary ink. Badges: Updates (unread
 * alerts) and Neighbours (unread chats + requests). Full-height press targets (66pt).
 */
import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Platform, AppState } from "react-native";
import { Tabs, Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useAuth } from "@/src/contexts/auth";
import { api } from "@/src/lib/api";
import { subscribeBadges } from "@/src/lib/badgeSignal";
import { useTheme } from "@/src/theme";
import { motion, radii } from "@/src/theme/tokens";
import { AppText } from "@/src/ui";
import { TAB_BAR_GAP, TAB_BAR_HEIGHT, useTabBarWidth } from "@/src/lib/tabBar";
import type { IconName } from "@/src/ui/icons";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="updates" options={{ title: "Updates" }} />
      <Tabs.Screen name="marketplace" options={{ title: "Market" }} />
      <Tabs.Screen name="neighbours" options={{ title: "Neighbours" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

/** Badge counts — Updates = unread alerts; Neighbours = unread chats + requests waiting on me. Polls every 30 s, on foreground, and whenever a screen signals a change. */
function useBadges(activeIndex: number) {
  const [counts, setCounts] = useState({ updates: 0, neighbours: 0 });
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([api.notifUnreadCount().catch(() => ({ unread: 0 })), api.chatUnreadCount().catch(() => ({ unread_count: 0 })), api.communityAlerts().catch(() => ({ total: 0 }))])
        .then(([n, c, a]) => alive && setCounts({ updates: n.unread ?? 0, neighbours: (c.unread_count ?? 0) + (a.total ?? 0) }))
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && load());
    const unsub = subscribeBadges(load);
    return () => {
      alive = false;
      clearInterval(id);
      sub.remove();
      unsub();
    };
  }, [activeIndex]);
  return counts;
}

const INDICATOR_W = 52;
const INDICATOR_H = 32;

function FloatingTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors, shadows, isDark } = useTheme();
  const barW = useTabBarWidth();
  const count = state.routes.length;
  const tabW = barW / count;
  const x = useSharedValue(0);
  const badges = useBadges(state.index);

  useEffect(() => {
    x.value = withSpring(state.index * tabW + (tabW - INDICATOR_W) / 2, motion.spring);
  }, [state.index, tabW, x]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) + TAB_BAR_GAP }]} pointerEvents="box-none" testID="floating-bottom-nav">
      <View style={[styles.pill, shadows.lg, { width: barW, backgroundColor: isDark ? colors.tabBar : "rgba(255,255,255,0.92)", borderColor: isDark ? colors.border : "rgba(17,17,17,0.06)" }]}>
        {Platform.OS !== "web" ? <BlurView intensity={isDark ? 50 : 70} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : null}
        <View style={styles.row} accessibilityRole="tablist">
          <Animated.View pointerEvents="none" style={[styles.indicator, { backgroundColor: colors.brandSoft }, indicator]} />
          {state.routes.map((r: any, i: number) => (
            <TabButton
              key={r.key}
              route={r}
              active={state.index === i}
              compact={tabW < 62}
              badge={r.name === "updates" ? badges.updates : r.name === "neighbours" ? badges.neighbours : 0}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: r.key, canPreventDefault: true });
                if (!event.defaultPrevented) navigation.navigate(r.name);
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function TabButton({ route, active, onPress, badge, compact }: any) {
  const { colors } = useTheme();
  const cfg = tabConfig(route.name);
  const scale = useSharedValue(1);
  const lift = useSharedValue(active ? -1 : 0);
  useEffect(() => {
    lift.value = withTiming(active ? -1 : 0, { duration: motion.base });
  }, [active, lift]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateY: lift.value }] }));
  const iconTint = active ? colors.brand : colors.textSecondary;
  const labelTint = active ? colors.text : colors.textSecondary;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        scale.value = withSequence(withSpring(0.86, motion.spring), withSpring(1.14, motion.springBounce), withSpring(1, motion.spring));
        onPress();
      }}
      style={styles.tab}
      hitSlop={{ top: 6, bottom: 6 }}
      testID={`tab-${route.name}`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      aria-selected={active}
      accessibilityLabel={`${cfg.label} tab${badge ? `, ${badge} unread` : ""}`}
    >
      <Animated.View style={[styles.iconWrap, anim]}>
        <Ionicons name={active ? cfg.iconActive : cfg.icon} size={23} color={iconTint} />
        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.brand, borderColor: active ? colors.brandSoft : colors.surface }]} testID={`tab-badge-${route.name}`}>
            <AppText variant="micro" color="#fff" tabular style={styles.badgeText}>
              {badge > 99 ? "99+" : badge}
            </AppText>
          </View>
        ) : null}
      </Animated.View>
      <AppText variant="micro" color={labelTint} numberOfLines={1} style={[styles.tabLabel, compact && styles.tabLabelCompact, active && styles.tabLabelActive]}>
        {cfg.label}
      </AppText>
    </Pressable>
  );
}

function tabConfig(routeName: string): { label: string; icon: IconName; iconActive: IconName } {
  switch (routeName) {
    case "index":
      return { label: "Home", icon: "home-outline", iconActive: "home" };
    case "updates":
      return { label: "Updates", icon: "notifications-outline", iconActive: "notifications" };
    case "marketplace":
      return { label: "Market", icon: "storefront-outline", iconActive: "storefront" };
    case "neighbours":
      return { label: "Neighbours", icon: "people-outline", iconActive: "people" };
    case "profile":
      return { label: "Profile", icon: "person-circle-outline", iconActive: "person-circle" };
    default:
      return { label: "", icon: "ellipse-outline", iconActive: "ellipse" };
  }
}

const styles = StyleSheet.create({
  container: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  pill: { height: TAB_BAR_HEIGHT, borderRadius: TAB_BAR_HEIGHT / 2, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", flex: 1, alignItems: "center", position: "relative" },
  indicator: { position: "absolute", left: 0, top: 8, width: INDICATOR_W, height: INDICATOR_H, borderRadius: radii.pill },
  tab: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center", paddingTop: 2, gap: 3 },
  iconWrap: { width: INDICATOR_W, height: INDICATOR_H, alignItems: "center", justifyContent: "center" },
  tabLabel: { fontSize: 11, lineHeight: 13, letterSpacing: 0 },
  tabLabelCompact: { fontSize: 9.5, letterSpacing: -0.2 },
  tabLabelActive: { fontFamily: "PlusJakartaSans-700" },
  badge: {
    position: "absolute",
    top: -3,
    right: 4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 9.5, lineHeight: 11, fontFamily: "PlusJakartaSans-700" },
});
