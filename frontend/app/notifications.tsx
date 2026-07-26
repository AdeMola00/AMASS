import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type Notif = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  body: string;
  time: string;
  unread?: boolean;
};

const NOTIFS: Notif[] = [
  { id: "1", icon: "trending-down", color: colors.emerald, title: "Price drop — Lekki Duplex", body: "₦145M → ₦135M. Save ₦10M on this verified listing.", time: "5m", unread: true },
  { id: "2", icon: "calendar", color: colors.gold, title: "Inspection reminder", body: "Ikoyi terrace tour tomorrow at 10:00 AM with Chidi.", time: "1h", unread: true },
  { id: "3", icon: "chatbubble", color: colors.info, title: "New reply from Adaeze", body: "Sure, we can arrange inspection this Saturday morning.", time: "3h" },
  { id: "4", icon: "shield-checkmark", color: colors.emerald, title: "Listing verified", body: "Your Abeokuta land listing has been title-verified.", time: "1d" },
  { id: "5", icon: "sparkles", color: "#8B5CF6", title: "AI recommendation", body: "3 new duplexes match your saved filters in Lekki.", time: "2d" },
];

export default function Notifications() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="notifications-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="notif-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Pressable style={styles.back}>
          <Ionicons name="checkmark-done" size={22} color={colors.emerald} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: 40 }}>
        {NOTIFS.map((n) => (
          <View key={n.id} style={[styles.card, shadows.soft]}>
            <View style={[styles.icon, { backgroundColor: n.color + "20" }]}>
              <Ionicons name={n.icon} size={20} color={n.color} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.rowTop}>
                <Text style={styles.itemTitle}>{n.title}</Text>
                <Text style={styles.time}>{n.time}</Text>
              </View>
              <Text style={styles.body}>{n.body}</Text>
            </View>
            {n.unread && <View style={styles.dot} />}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemTitle: { ...typography.body, fontWeight: "700", flex: 1 },
  time: { ...typography.caption, color: colors.textTertiary },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
});
