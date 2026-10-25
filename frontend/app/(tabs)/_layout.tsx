/**
 * Tabs shell + AMASS bottom navigation.
 * A solid, full-width bar (never floating over content): five big, evenly spaced tabs —
 * Find Home · Feeds · Market · My Home · My Amass. The active tab is AMASS-red (filled icon,
 * bold label) on a soft red capsule that slides between tabs; inactive tabs stay legible in
 * secondary ink. Badges: Feeds (unread alerts) and My Home (unread chats + requests).
 * Every tab is a full-height 66 pt press target.
 */
import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, AppState, useWindowDimensions } from "react-native";
import { Tabs, Redirect } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useAuth } from "@/src/contexts/auth";
import { api } from "@/src/lib/api";
import { subscribeBadges } from "@/src/lib/badgeSignal";
import { useTheme } from "@/src/theme";
import { motion, radii } from "@/src/theme/tokens";
import { AppText, useReducedMotion } from "@/src/ui";
import { TAB_BAR_HEIGHT } from "@/src/lib/tabBar";
import type { IconName } from "@/src/ui/icons";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BottomNav {...props} />}>
      <Tabs.Screen name="index" options={{ title: "Find Home" }} />
      <Tabs.Screen name="updates" options={{ title: "Feeds" }} />
      <Tabs.Screen name="marketplace" options={{ title: "Market" }} />
      <Tabs.Screen name="neighbours" options={{ title: "My Home" }} />
      <Tabs.Screen name="profile" options={{ title: "My Amass" }} />
    </Tabs>
  );
}

/** Badge counts — Feeds = unread alerts; My Home = unread chats + requests waiting on me. Polls every 30 s, on foreground, and whenever a screen signals a change. */
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

const CAPSULE_W = 60;
const CAPSULE_H = 32;
/** Wide screens: the row of tabs stops stretching so icons and labels stay close together. */
const MAX_ROW_W = 640;

// expo-router 58: custom tabBar receives { state, descriptors, emitter, navigateToTab, insets } (no `navigation`).
function BottomNav({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const rowW = Math.min(width, MAX_ROW_W);
  const count = state.routes.length;
  const tabW = rowW / count;
  const x = useSharedValue(0);
  const badges = useBadges(state.index);

  useEffect(() => {
    const target = state.index * tabW + (tabW - CAPSULE_W) / 2;
    x.value = reduce ? target : withSpring(target, motion.spring);
  }, [state.index, tabW, x, reduce]);
  const capsule = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: isDark ? colors.bgElevated : "#FFFFFF", borderTopColor: colors.border }, !isDark && styles.barShadow]}
      testID="bottom-nav"
    >
      <View style={[styles.row, { width: rowW }]} accessibilityRole="tablist">
        <Animated.View pointerEvents="none" style={[styles.capsule, { backgroundColor: colors.brandSoft }, capsule]} />
        {state.routes.map((r: any, i: number) => (
          <TabButton
            key={r.key}
            route={r}
            active={state.index === i}
            compact={tabW < 72}
            reduce={reduce}
            badge={r.name === "updates" ? badges.updates : r.name === "neighbours" ? badges.neighbours : 0}
            onPress={() => {
              const event = emitter.emit({ type: "tabPress", target: r.key, canPreventDefault: true });
              if (state.index !== i && !event.defaultPrevented) navigateToTab(r.key);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function TabButton({ route, active, onPress, badge, compact, reduce }: any) {
  const { colors } = useTheme();
  const cfg = tabConfig(route.name);
  const scale = useSharedValue(1);
  const lift = useSharedValue(active ? -1 : 0);
  useEffect(() => {
    lift.value = reduce ? (active ? -1 : 0) : withTiming(active ? -1 : 0, { duration: motion.base });
  }, [active, lift, reduce]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateY: lift.value }] }));
  const tint = active ? colors.brand : colors.textSecondary;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        if (!reduce) scale.value = withSequence(withSpring(0.88, motion.spring), withSpring(1.1, motion.springBounce), withSpring(1, motion.spring));
        onPress();
      }}
      style={styles.tab}
      testID={`tab-${route.name}`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      aria-selected={active}
      accessibilityLabel={`${cfg.label} tab${badge ? `, ${badge} unread` : ""}`}
    >
      <Animated.View style={[styles.iconWrap, anim]}>
        <Ionicons name={active ? cfg.iconActive : cfg.icon} size={27} color={tint} />
        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.brand, borderColor: active ? colors.brandSoft : colors.bgElevated }]} testID={`tab-badge-${route.name}`}>
            <AppText variant="micro" color="#fff" tabular style={styles.badgeText}>
              {badge > 99 ? "99+" : badge}
            </AppText>
          </View>
        ) : null}
      </Animated.View>
      <AppText color={tint} numberOfLines={1} style={[styles.label, compact && styles.labelCompact, active && styles.labelActive]}>
        {cfg.label}
      </AppText>
    </Pressable>
  );
}

function tabConfig(routeName: string): { label: string; icon: IconName; iconActive: IconName } {
  switch (routeName) {
    case "index":
      return { label: "Find Home", icon: "search-outline", iconActive: "search" };
    case "updates":
      return { label: "Feeds", icon: "newspaper-outline", iconActive: "newspaper" };
    case "marketplace":
      return { label: "Market", icon: "storefront-outline", iconActive: "storefront" };
    case "neighbours":
      return { label: "My Home", icon: "home-outline", iconActive: "home" };
    case "profile":
      return { label: "My Amass", icon: "person-circle-outline", iconActive: "person-circle" };
    default:
      return { label: "", icon: "ellipse-outline", iconActive: "ellipse" };
  }
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth },
  barShadow: { shadowColor: "#111111", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 12 },
  row: { flexDirection: "row", height: TAB_BAR_HEIGHT, alignItems: "stretch", position: "relative" },
  capsule: { position: "absolute", left: 0, top: 7, width: CAPSULE_W, height: CAPSULE_H, borderRadius: radii.pill },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 4, gap: 4 },
  iconWrap: { width: CAPSULE_W, height: CAPSULE_H, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, lineHeight: 17, letterSpacing: -0.2, fontFamily: "PlusJakartaSans-700" },
  labelCompact: { fontSize: 11.5, letterSpacing: -0.4 },
  labelActive: { fontFamily: "PlusJakartaSans-800" },
  badge: {
    position: "absolute",
    top: -4,
    right: 6,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10.5, lineHeight: 12, fontFamily: "PlusJakartaSans-700" },
});
