import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, AgentPublic } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";

export default function IdentityVerification() {
  const router = useRouter();
  const { user } = useAuth();
  const [agent, setAgent] = useState<AgentPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.agentMe().then(setAgent).catch(() => setAgent(null)).finally(() => setLoading(false));
  }, []);

  const level = agent?.verification_level ?? 0;
  const emailDone = !!user?.email;
  const phoneDone = !!user?.phone;
  const idDone = level >= 2;
  const mandateDone = level >= 3;
  const verifiedCount = [emailDone, phoneDone, idDone].filter(Boolean).length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="idv-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Identity Verification</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: 14 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, idDone ? styles.heroVerified : null]}>
            <View style={styles.heroBadge}>
              <Ionicons name={idDone ? "shield-checkmark" : "shield-outline"} size={30} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>
              {mandateDone ? "Verified Mandated Agent" : idDone ? "Identity Verified" : "Build trust with verification"}
            </Text>
            <Text style={styles.heroSub}>
              {idDone
                ? "Your identity is verified. Buyers and sellers see your trusted badge across AMASS."
                : "Verified members win more trust — and it's required to market properties as an agent."}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(verifiedCount / 3) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>{verifiedCount} of 3 steps complete</Text>
          </View>

          <View style={styles.list}>
            <Tier done={emailDone} icon="mail" title="Email confirmed" caption={user?.email ?? "Add an email"} />
            <Tier done={phoneDone} icon="call" title="Phone number" caption={phoneDone ? user?.phone ?? "" : "Add your phone in Settings"} onPress={phoneDone ? undefined : () => router.push("/settings")} />
            <Tier done={idDone} icon="card" title="Government ID + selfie" caption={idDone ? "Verified" : "Upload a valid ID and a selfie"} />
            <Tier done={mandateDone} icon="ribbon" title="Verified Mandated Agent" caption={mandateDone ? "Approved by AMASS" : "Granted after AMASS reviews your mandate"} last />
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color={colors.textSecondary} />
            <Text style={styles.infoText}>
              Government ID and selfie checks are completed through the agent verification flow. This upgrades you to Level 2 (Identity Verified).
            </Text>
          </View>

          {!mandateDone && (
            <Pressable style={styles.cta} onPress={() => router.push("/become-agent")} testID="idv-cta">
              <Ionicons name="shield-checkmark" size={18} color="#fff" />
              <Text style={styles.ctaText}>{idDone ? "Continue verification" : "Verify my identity"}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Tier({
  done,
  icon,
  title,
  caption,
  onPress,
  last,
}: {
  done: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  caption: string;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[styles.tier, !last && styles.tierBorder]}
    >
      <View style={[styles.tierIcon, done && styles.tierIconDone]}>
        <Ionicons name={done ? "checkmark" : icon} size={18} color={done ? "#fff" : colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tierTitle}>{title}</Text>
        <Text style={styles.tierCaption} numberOfLines={1}>{caption}</Text>
      </View>
      {done ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.emerald} />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 20, gap: 8, alignItems: "flex-start" },
  heroVerified: { backgroundColor: "#064E3B" },
  heroBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 19 },
  progressTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)", marginTop: 8, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.emerald, borderRadius: 3 },
  progressText: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },

  list: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadows.soft },
  tier: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  tierBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  tierIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  tierIconDone: { backgroundColor: colors.emerald },
  tierTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  tierCaption: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },

  infoBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  infoText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  cta: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...shadows.soft,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
