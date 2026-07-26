import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/contexts/auth";
import { colors, shadows } from "@/src/constants/theme";
import { Redirect } from "expo-router";

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: "index", label: "Home", icon: "map-outline", iconActive: "map" },
  { name: "discover", label: "Discover", icon: "compass-outline", iconActive: "compass" },
  { name: "_ai", label: "AI", icon: "sparkles", iconActive: "sparkles" },
  { name: "marketplace", label: "Market", icon: "grid-outline", iconActive: "grid" },
  { name: "messages", label: "Messages", icon: "chatbubbles-outline", iconActive: "chatbubbles" },
  { name: "profile", label: "Profile", icon: "person-outline", iconActive: "person" },
];

export default function TabsLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingBottomBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="discover" options={{ title: "Discover" }} />
      <Tabs.Screen name="marketplace" options={{ title: "Market" }} />
      <Tabs.Screen name="messages" options={{ title: "Messages" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

function FloatingBottomBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = Math.max(insets.bottom, 12);

  const openAI = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push("/ai-search");
  };

  const orderedRoutes = state.routes;

  return (
    <View
      style={[styles.container, { bottom: bottomInset }]}
      pointerEvents="box-none"
      testID="floating-bottom-nav"
    >
      <View style={[styles.barShadow, shadows.floating]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.96)" }]} />
        )}
        <View style={styles.bar}>
          {orderedRoutes.slice(0, 2).map((r: any, i: number) => (
            <TabButton
              key={r.key}
              route={r}
              index={i}
              active={state.index === i}
              onPress={() => navigation.navigate(r.name)}
            />
          ))}

          <View style={styles.fabSlot} />

          {orderedRoutes.slice(2).map((r: any, i: number) => (
            <TabButton
              key={r.key}
              route={r}
              index={i + 2}
              active={state.index === i + 2}
              onPress={() => navigation.navigate(r.name)}
            />
          ))}
        </View>
      </View>

      <Pressable
        onPress={openAI}
        style={[styles.fab, shadows.floating, { bottom: 12 }]}
        testID="ai-search-fab"
      >
        <Ionicons name="sparkles" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

function TabButton({ route, index, active, onPress }: any) {
  const cfg = tabConfig(route.name);
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={styles.tab}
      testID={`tab-${route.name}`}
    >
      <Ionicons
        name={active ? cfg.iconActive : cfg.icon}
        size={22}
        color={active ? colors.emerald : colors.textTertiary}
      />
      <Text style={[styles.tabLabel, active && { color: colors.emerald, fontWeight: "700" }]}>
        {cfg.label}
      </Text>
    </Pressable>
  );
}

function tabConfig(routeName: string) {
  switch (routeName) {
    case "index":
      return { label: "Home", icon: "map-outline" as IconName, iconActive: "map" as IconName };
    case "discover":
      return { label: "Discover", icon: "compass-outline" as IconName, iconActive: "compass" as IconName };
    case "marketplace":
      return { label: "Market", icon: "grid-outline" as IconName, iconActive: "grid" as IconName };
    case "messages":
      return {
        label: "Messages",
        icon: "chatbubbles-outline" as IconName,
        iconActive: "chatbubbles" as IconName,
      };
    case "profile":
      return { label: "Profile", icon: "person-outline" as IconName, iconActive: "person" as IconName };
    default:
      return { label: "", icon: "ellipse-outline" as IconName, iconActive: "ellipse" as IconName };
  }
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "center",
  },
  barShadow: {
    borderRadius: 32,
    overflow: "hidden",
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  bar: {
    flexDirection: "row",
    height: 68,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textTertiary,
  },
  fabSlot: {
    width: 72,
  },
  fab: {
    position: "absolute",
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#fff",
  },
});
