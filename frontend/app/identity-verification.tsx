import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { api, AgentPublic } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, ProgressBar, Screen, ScreenHeader, Skeleton, type IconName } from "@/src/ui";

export default function IdentityVerification() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
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

  const steps: { done: boolean; icon: IconName; title: string; caption: string; onPress?: () => void; cta?: string; current?: boolean }[] = [
    { done: emailDone, icon: "mail", title: "Email confirmed", caption: user?.email ?? "Add an email" },
    { done: phoneDone, icon: "call", title: "Phone number", caption: phoneDone ? user?.phone ?? "" : "Verify your number — it also earns 5 MASS", onPress: phoneDone ? undefined : () => router.push("/earn"), cta: "Verify" },
    { done: idDone, icon: "card", title: "Government ID + selfie", caption: idDone ? "Verified by AMASS" : "Upload a valid ID and take a quick selfie", onPress: idDone ? undefined : () => router.push("/become-agent"), cta: "Start" },
    { done: mandateDone, icon: "ribbon", title: "Verified Mandated Agent", caption: mandateDone ? "Approved by AMASS" : "Granted after AMASS reviews your mandate" },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);

  return (
    <Screen testID="identity-verification-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Identity Verification" subtitle="Build trust across AMASS" testID="idv-header" />

      {loading ? (
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={190} radius={radii.xl} />
          <Skeleton height={64} radius={radii.lg} />
          <Skeleton height={64} radius={radii.lg} />
          <Skeleton height={64} radius={radii.lg} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={idDone ? (isDark ? ["#0F2A1D", "#0A1F16"] : ["#0B3B2A", "#052E1F"]) : isDark ? ["#1F1D1A", "#141210"] : ["#1A1816", "#0A0A0A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
            testID="idv-hero"
          >
            <View style={styles.heroBadge}>
              <Ionicons name={idDone ? "shield-checkmark" : "shield-outline"} size={28} color="#fff" />
            </View>
            <AppText variant="h2" color="#fff">
              {mandateDone ? "Verified Mandated Agent" : idDone ? "Identity verified" : "Build trust with verification"}
            </AppText>
            <AppText variant="bodySm" color="rgba(255,255,255,0.75)">
              {idDone ? "Your identity is verified. Buyers and sellers see your trusted badge across AMASS." : "Verified members win more trust — and it's required to market properties as an agent."}
            </AppText>
            <View style={{ gap: 6, marginTop: 4 }}>
              <ProgressBar value={verifiedCount / 3} tone={idDone ? "fix" : "mass"} height={6} style={{ backgroundColor: "rgba(255,255,255,0.18)" }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <AppText variant="micro" color="rgba(255,255,255,0.7)" uppercase>
                  {verifiedCount} of 3 steps complete
                </AppText>
                {idDone ? <Badge label="Verified" tone="fix" icon="shield-checkmark" size="xs" /> : <Badge label={`Level ${level}`} tone="mass" size="xs" />}
              </View>
            </View>
          </LinearGradient>

          <View style={{ gap: space[3] }}>
            {steps.map((s, i) => {
              const current = i === currentIdx;
              return (
                <Card key={s.title} testID={`idv-step-${i}`} style={current ? { borderColor: colors.brand, borderWidth: 1 } : undefined}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <View style={[styles.stepIcon, { backgroundColor: s.done ? colors.success : current ? colors.brandSoft : colors.surfaceAlt }]}>
                      {s.done ? <Ionicons name="checkmark" size={18} color="#fff" /> : <Ionicons name={s.icon} size={18} color={current ? colors.brand : colors.textSecondary} />}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <AppText variant="title">{s.title}</AppText>
                        {current ? <Badge label="Next step" tone="brand" size="xs" /> : null}
                      </View>
                      <AppText variant="caption" tone="tertiary" numberOfLines={2}>
                        {s.caption}
                      </AppText>
                    </View>
                    {s.done ? (
                      <Badge label="Done" tone="success" icon="checkmark-circle" size="xs" />
                    ) : s.onPress ? (
                      <Button label={s.cta ?? "Start"} size="sm" variant={current ? "primary" : "secondary"} onPress={s.onPress} />
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </View>

          <View style={[styles.info, { backgroundColor: colors.infoSoft }]}>
            <Ionicons name="information-circle" size={18} color={colors.info} />
            <AppText variant="caption" color={colors.info} style={{ flex: 1 }}>
              Government ID and selfie checks are completed through the agent verification flow. Your documents are encrypted and only reviewed by the AMASS trust team.
            </AppText>
          </View>

          {!mandateDone ? <Button label={idDone ? "Continue verification" : "Verify my identity"} variant="brand" size="lg" fullWidth iconLeft="shield-checkmark" onPress={() => router.push("/become-agent")} testID="idv-cta" /> : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: 20, gap: 10, overflow: "hidden" },
  heroBadge: { width: 52, height: 52, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stepIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  info: { flexDirection: "row", gap: 10, padding: 14, borderRadius: radii.md, alignItems: "center" },
});
