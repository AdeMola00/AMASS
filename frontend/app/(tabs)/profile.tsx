import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";
import { AmassPinIcon } from "@/src/components/AmassLogo";

type IconName = keyof typeof Ionicons.glyphMap;

const MENU: { icon: IconName; label: string; route?: string; caption?: string }[] = [
  { icon: "ribbon-outline", label: "Become an Agent", route: "/become-agent", caption: "Verified authority to market properties" },
  { icon: "briefcase-outline", label: "Agent Dashboard", route: "/agent-dashboard", caption: "Listings, leads & analytics" },
  { icon: "add-circle-outline", label: "List a Property", route: "/submit-property", caption: "Publish a new listing" },
  { icon: "heart-outline", label: "Saved Properties", caption: "Your favorites" },
  { icon: "document-text-outline", label: "My Documents", caption: "Contracts & titles" },
  { icon: "shield-checkmark-outline", label: "Identity Verification", caption: "Enhance trust" },
  { icon: "wallet-outline", label: "Transactions" },
  { icon: "card-outline", label: "Payment Methods" },
  { icon: "notifications-outline", label: "Notifications", route: "/notifications" },
  { icon: "settings-outline", label: "Settings", route: "/settings" },
  { icon: "help-circle-outline", label: "Help & Support" },
  { icon: "information-circle-outline", label: "About AMASS" },
];

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  const doSignOut = () => {
    Alert.alert("Sign out?", "You'll need to sign in again to continue.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatarLarge}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={{ width: 88, height: 88, borderRadius: 44 }} />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name}>{user?.full_name || "AMASS Member"}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.tier}>
                <Ionicons name="star" size={12} color={colors.gold} />
                <Text style={styles.tierText}>Premium</Text>
              </View>
              <View style={styles.tierAlt}>
                <AmassPinIcon size={10} />
                <Text style={styles.tierAltText}>Verified</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.stats}>
          <StatCard label="Saved" value="12" icon="heart" color={colors.red} />
          <StatCard label="Viewed" value="47" icon="eye" color={colors.text} />
          <StatCard label="Tours" value="3" icon="calendar" color={colors.gold} />
        </View>

        <View style={styles.menu}>
          {MENU.map((m) => (
            <Pressable
              key={m.label}
              style={styles.menuRow}
              onPress={() => (m.route ? router.push(m.route as any) : null)}
              testID={`menu-${m.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <View style={styles.menuIcon}>
                <Ionicons name={m.icon} size={20} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{m.label}</Text>
                {m.caption && <Text style={styles.menuCaption}>{m.caption}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.signOut} onPress={doSignOut} testID="sign-out-button">
          <Ionicons name="log-out-outline" size={20} color={colors.red} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: IconName;
  color: string;
}) {
  return (
    <View style={[styles.statCard, shadows.soft]}>
      <View style={[styles.statIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    paddingTop: spacing.md,
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
  },
  name: { ...typography.h2 },
  email: { ...typography.caption, color: colors.textTertiary },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  tier: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.goldLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tierText: { fontSize: 11, fontWeight: "700", color: colors.gold },
  tierAlt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.emeraldSurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tierAltText: { fontSize: 11, fontWeight: "700", color: colors.emerald },
  stats: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: 6,
  },
  statIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textTertiary, fontWeight: "600" },
  menu: {
    marginHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    overflow: "hidden",
    ...shadows.soft,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { ...typography.body, fontWeight: "600" },
  menuCaption: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.xl,
    marginHorizontal: spacing.xl,
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.red,
  },
  signOutText: { color: colors.red, fontSize: 15, fontWeight: "700" },
});
