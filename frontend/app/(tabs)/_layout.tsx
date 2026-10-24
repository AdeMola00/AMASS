import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Platform, LayoutChangeEvent, AppState } from "react-native";
import { Tabs, Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import { useAuth } from "@/src/contexts/auth";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { motion } from "@/src/theme/tokens";
import { AppText } from "@/src/ui";

import type { IconName } from "@/src/ui/icons";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingBottomBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="social" options={{ title: "Social" }} />
      <Tabs.Screen name="marketplace" options={{ title: "Market" }} />
      <Tabs.Screen name="neighbours" options={{ title: "Neighbours" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

function useUnreadCount(active: boolean) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    // Neighbours tab badge = unread chats + alerts waiting on me (estate join requests I manage, friend requests).
    const load = () =>
      Promise.all([api.chatUnreadCount().catch(() => ({ unread_count: 0 })), api.communityAlerts().catch(() => ({ total: 0 }))])
        .then(([c, a]) => alive && setUnread((c.unread_count ?? 0) + (a.total ?? 0)))
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && load());
    return () => {
      alive = false;
      clearInterval(id);
      sub.remove();
    };
  }, [active]);
  return unread;
}

/* Edge-to-edge glass tab bar — no border, Ink Black active state, soft-grey
   sliding pill under the active tab. */
function FloatingBottomBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors, shadows, isDark } = useTheme();
  const bottomInset = Math.max(insets.bottom, 10);
  const [barW, setBarW] = useState(0);
  const count = state.routes.length;
  const tabW = barW > 0 ? (barW - 16) / count : 0;
  const x = useSharedValue(0);
  const unread = useUnreadCount(state.index === 3);

  useEffect(() => {
    x.value = withSpring(state.index * tabW, motion.spring);
  }, [state.index, tabW, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const accent = tabConfig(state.routes[state.index]?.name ?? "", colors).accent;

  return (
    <View style={styles.container} pointerEvents="box-none" testID="floating-bottom-nav">
      <View
        style={[styles.barShadow, shadows.lg, { backgroundColor: colors.tabBar, paddingBottom: bottomInset }]}
        onLayout={(e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width)}
      >
        {Platform.OS !== "web" ? <BlurView intensity={isDark ? 60 : 80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : null}
        <View style={styles.bar} accessibilityRole="tablist">
          {tabW > 0 ? (
            <Animated.View pointerEvents="none" style={[styles.pill, { width: tabW, backgroundColor: `${accent}1F` }, pill]} />
          ) : null}
          {state.routes.map((r: any, i: number) => (
            <TabButton
              key={r.key}
              route={r}
              active={state.index === i}
              badge={r.name === "neighbours" ? unread : 0}
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

function TabButton({ route, active, onPress, badge }: any) {
  const { colors } = useTheme();
  const cfg = tabConfig(route.name, colors);
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = active ? cfg.accent : colors.textSecondary;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        scale.value = withSequence(withSpring(0.85, motion.spring), withSpring(1.18, motion.springBounce), withSpring(1, motion.spring));
        onPress();
      }}
      style={styles.tab}
      testID={`tab-${route.name}`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${cfg.label} tab${badge ? `, ${badge} unread` : ""}`}
    >
      <Animated.View style={[styles.iconWrap, anim]}>
        <Ionicons name={active ? cfg.iconActive : cfg.icon} size={24} color={tint} />
        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.brand, borderColor: colors.tabBar }]}>
            <AppText variant="micro" color="#fff" tabular>
              {badge > 99 ? "99+" : badge}
            </AppText>
          </View>
        ) : null}
      </Animated.View>
      <AppText variant="micro" color={tint} style={styles.tabLabel}>
        {cfg.label}
      </AppText>
    </Pressable>
  );
}

/** Each tab carries its section accent — users know where they are by colour alone. */
function tabConfig(routeName: string, colors: ReturnType<typeof useTheme>["colors"]): { label: string; icon: IconName; iconActive: IconName; accent: string } {
  switch (routeName) {
    case "index":
      return { label: "Home", icon: "map-outline", iconActive: "map", accent: colors.brand };
    case "social":
      return { label: "Social", icon: "chatbubbles-outline", iconActive: "chatbubbles", accent: colors.fix };
    case "marketplace":
      return { label: "Market", icon: "grid-outline", iconActive: "grid", accent: colors.market };
    case "neighbours":
      return { label: "Neighbours", icon: "people-outline", iconActive: "people", accent: colors.info };
    case "profile":
      return { label: "Profile", icon: "person-outline", iconActive: "person", accent: colors.text };
    default:
      return { label: "", icon: "ellipse-outline", iconActive: "ellipse", accent: colors.text };
  }
}

const styles = StyleSheet.create({
  container: { position: "absolute", left: 0, right: 0, bottom: 0 },
  barShadow: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", width: "100%" },
  bar: { flexDirection: "row", height: 64, alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, position: "relative" },
  pill: { position: "absolute", left: 8, top: 8, bottom: 8, borderRadius: 24 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, height: "100%" },
  iconWrap: { width: 28, height: 26, alignItems: "center", justifyContent: "center" },
  tabLabel: { letterSpacing: 0, fontSize: 11, lineHeight: 13 },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
