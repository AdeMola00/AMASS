import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/contexts/auth";
import { colors, shadows } from "@/src/constants/theme";
import { Redirect } from "expo-router";

type IconName = keyof typeof Ionicons.glyphMap;

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
      <Tabs.Screen name="messages" options={{ title: "Inbox" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

function FloatingBottomBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);

  return (
    <View
      style={[styles.container, { bottom: bottomInset }]}
      pointerEvents="box-none"
      testID="floating-bottom-nav"
    >
      <View style={[styles.barShadow, shadows.floating]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.98)" }]} />
        )}
        <View style={styles.bar}>
          {state.routes.map((r: any, i: number) => (
            <TabButton
              key={r.key}
              route={r}
              active={state.index === i}
              onPress={() => navigation.navigate(r.name)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function TabButton({ route, active, onPress }: any) {
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
      {active && <View style={styles.activeIndicator} />}
      <Ionicons
        name={active ? cfg.iconActive : cfg.icon}
        size={22}
        color={active ? colors.text : colors.textTertiary}
      />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{cfg.label}</Text>
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
      return { label: "Inbox", icon: "chatbubbles-outline" as IconName, iconActive: "chatbubbles" as IconName };
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
    height: "100%",
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    top: 8,
    width: 26,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.red,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textTertiary,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: colors.text,
    fontWeight: "800",
  },
});
