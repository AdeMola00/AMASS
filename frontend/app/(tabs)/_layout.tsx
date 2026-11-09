import Ionicons from "@react-native-vector-icons/ionicons";
import { Redirect, Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { useSettings } from "@/src/settings";
import { colors, fonts } from "@/src/theme";

export default function TabsLayout() {
  const { t } = useSettings();
  const { status, me } = useAuth();
  if (status === "out") return <Redirect href="/login" />;
  const unread = me?.counts?.unread_messages || 0;

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="house.fill" />
          <NativeTabs.Trigger.Label>{t("tab_home")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="work">
          <NativeTabs.Trigger.Icon sf="briefcase.fill" />
          <NativeTabs.Trigger.Label>{t("tab_work")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="messages">
          <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" />
          <NativeTabs.Trigger.Label>{t("tab_messages")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="me">
          <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" />
          <NativeTabs.Trigger.Label>{t("tab_me")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  const icon = (on: string, off: string) =>
    function TabIcon({ focused, color }: { focused: boolean; color: string }) {
      return <Ionicons name={(focused ? on : off) as any} size={28} color={color} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 13 },
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 72 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tab_home"), tabBarIcon: icon("home", "home-outline"), tabBarButtonTestID: "tab-home" } as any} />
      <Tabs.Screen name="work" options={{ title: t("tab_work"), tabBarIcon: icon("briefcase", "briefcase-outline"), tabBarButtonTestID: "tab-work" } as any} />
      <Tabs.Screen
        name="messages"
        options={{ title: t("tab_messages"), tabBarIcon: icon("chatbubbles", "chatbubbles-outline"), tabBarBadge: unread || undefined, tabBarBadgeStyle: { backgroundColor: colors.brandPrimary }, tabBarButtonTestID: "tab-messages" } as any}
      />
      <Tabs.Screen name="me" options={{ title: t("tab_me"), tabBarIcon: icon("person-circle", "person-circle-outline"), tabBarButtonTestID: "tab-me" } as any} />
    </Tabs>
  );
}
