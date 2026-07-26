import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type IconName = keyof typeof Ionicons.glyphMap;

export default function Settings() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="settings-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl, paddingBottom: 40 }}>
        <Section title="Preferences">
          <Row icon="moon-outline" label="Dark mode" trailing={<Switch value={darkMode} onValueChange={setDarkMode} />} />
          <Row icon="language-outline" label="Language" value="English" onPress={() => {}} />
          <Row icon="cash-outline" label="Currency" value="Naira (₦)" onPress={() => {}} />
        </Section>

        <Section title="Notifications">
          <Row icon="notifications-outline" label="Push notifications" trailing={<Switch value={pushEnabled} onValueChange={setPushEnabled} />} />
          <Row icon="mail-outline" label="Email updates" trailing={<Switch value={emailEnabled} onValueChange={setEmailEnabled} />} />
        </Section>

        <Section title="Security">
          <Row icon="finger-print-outline" label="Biometric unlock" trailing={<Switch value={true} onValueChange={() => {}} />} />
          <Row icon="lock-closed-outline" label="Change password" onPress={() => {}} />
        </Section>

        <Section title="Account">
          <Row icon="star-outline" label="Subscription" value="Premium" onPress={() => {}} />
          <Row icon="trash-outline" label="Delete account" onPress={() => {}} destructive />
        </Section>

        <Text style={styles.version}>AMASS v1.0.0 · Africa&apos;s Property OS</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={[styles.card, shadows.soft]}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  trailing,
  onPress,
  destructive,
}: {
  icon: IconName;
  label: string;
  value?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`settings-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <View style={[styles.rowIcon, destructive && { backgroundColor: colors.redLight }]}>
        <Ionicons name={icon} size={18} color={destructive ? colors.red : colors.text} />
      </View>
      <Text style={[styles.rowLabel, destructive && { color: colors.red }]}>{label}</Text>
      {value ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : trailing ? (
        trailing
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Pressable>
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
  sectionTitle: { fontSize: 11, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.8, marginLeft: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, ...typography.body, fontWeight: "500" },
  rowValue: { ...typography.caption, color: colors.textTertiary },
  version: { textAlign: "center", color: colors.textMuted, fontSize: 12, marginTop: spacing.xl },
});
