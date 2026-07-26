import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/src/constants/theme";

type Thread = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  last: string;
  time: string;
  unread: number;
  online?: boolean;
};

const THREADS: Thread[] = [
  {
    id: "1",
    name: "Adaeze Okoye",
    role: "Agent · Lekki Phase 1 duplex",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
    last: "Sure, we can arrange inspection this Saturday morning.",
    time: "2m",
    unread: 2,
    online: true,
  },
  {
    id: "2",
    name: "Chidi Nwosu",
    role: "Agent · Ikoyi terrace",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
    last: "Documents just went to your email 📄",
    time: "1h",
    unread: 0,
  },
  {
    id: "3",
    name: "Fatima Bello",
    role: "Agent · VI penthouse",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200",
    last: "Voice message · 0:34",
    time: "3h",
    unread: 1,
  },
  {
    id: "4",
    name: "AMASS Concierge",
    role: "Premium support",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200",
    last: "Welcome to AMASS! How can we help today?",
    time: "1d",
    unread: 0,
  },
];

export default function Messages() {
  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="messages-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>Messages</Text>
        <Pressable style={styles.searchBtn} hitSlop={8}>
          <Ionicons name="search" size={20} color={colors.text} />
        </Pressable>
      </View>

      <FlatList
        data={THREADS}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingBottom: 140 }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <Pressable style={styles.row} testID={`thread-${item.id}`}>
            <View>
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
              {item.online && <View style={styles.online} />}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.topRow}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.time}>{item.time}</Text>
              </View>
              <Text numberOfLines={1} style={styles.role}>
                {item.role}
              </Text>
              <Text numberOfLines={1} style={[styles.last, item.unread > 0 && styles.lastUnread]}>
                {item.last}
              </Text>
            </View>
            {item.unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  h1: { ...typography.display },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  sep: { height: 1, backgroundColor: colors.divider, marginLeft: 84 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  online: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.emerald,
    borderWidth: 2,
    borderColor: "#fff",
  },
  topRow: { flexDirection: "row", justifyContent: "space-between" },
  name: { ...typography.h3, fontSize: 16 },
  time: { ...typography.caption, color: colors.textTertiary },
  role: { ...typography.caption, color: colors.emerald, fontWeight: "600" },
  last: { fontSize: 14, color: colors.textTertiary },
  lastUnread: { color: colors.text, fontWeight: "600" },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
