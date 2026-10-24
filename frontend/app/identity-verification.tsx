/**
 * Identity Verification — real KYC: pick an ID type, photograph the ID, take a selfie, submit.
 * The AMASS team reviews it in the admin portal; the verified badge only appears after approval.
 * Agents additionally see the mandate step (level 3) from their agent profile.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, type AgentPublic, type KycMe } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, Input, ProgressBar, Screen, ScreenHeader, Skeleton, useCelebrate, useToast, type IconName } from "@/src/ui";
import { PhotoField } from "@/src/components/kyc/PhotoField";
import { IdentityBadge, KYC_META } from "@/src/components/kyc/badges";

export default function IdentityVerification() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const [kyc, setKyc] = useState<KycMe | null>(null);
  const [agent, setAgent] = useState<AgentPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  // Submission form
  const [formOpen, setFormOpen] = useState(false);
  const [idType, setIdType] = useState<string>("nin");
  const [last4, setLast4] = useState("");
  const [idPhoto, setIdPhoto] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [k, a] = await Promise.all([api.kycMe(), user?.is_agent ? api.agentMe().catch(() => null) : Promise.resolve(null)]);
      setKyc(k);
      setAgent(a);
    } catch {
      setError(true);
    }
  }, [user?.is_agent]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const status = kyc?.status ?? "none";
  const idDone = status === "approved";
  const pending = status === "pending";
  const rejected = status === "rejected";
  const emailDone = !!user?.email;
  const phoneDone = !!user?.phone_verified;
  const mandateDone = (agent?.verification_level ?? 0) >= 3;
  const verifiedCount = [emailDone, phoneDone, idDone].filter(Boolean).length;
  const meta = KYC_META[status];
  const canSubmit = !!idPhoto && !!selfie && !submitting;

  const submit = async () => {
    if (!idPhoto || !selfie) return;
    setSubmitting(true);
    try {
      const res = await api.kycSubmitIdentity({ id_type: idType, id_document: idPhoto, selfie, id_number_last4: last4.trim() || undefined });
      setKyc((k) => ({ ...(k ?? ({} as KycMe)), ...res, id_types: k?.id_types ?? [] }));
      setFormOpen(false);
      setIdPhoto(null);
      setSelfie(null);
      setLast4("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      celebrate({ title: "Documents sent", icon: "shield-checkmark" });
      toast.success("Sent for review", "The AMASS team reviews most submissions within one business day.");
      refresh().catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't submit", e?.message || "Please check your photos and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const idTypes = useMemo(() => kyc?.id_types ?? [], [kyc?.id_types]);

  const steps: { done: boolean; icon: IconName; title: string; caption: string; onPress?: () => void; cta?: string; badge?: React.ReactNode }[] = [
    { done: emailDone, icon: "mail", title: "Email confirmed", caption: user?.email ?? "Add an email" },
    { done: phoneDone, icon: "call", title: "Phone number", caption: phoneDone ? user?.phone ?? "Verified" : user?.phone ? `${user.phone} — not verified yet (earns 5 MASS)` : "Verify your number — it also earns 5 MASS", onPress: phoneDone ? undefined : () => router.push("/(auth)/phone" as any), cta: "Verify" },
    {
      done: idDone,
      icon: "card",
      title: "Government ID + selfie",
      caption: idDone ? `${kyc?.id_type_label ?? "ID"} verified by AMASS` : pending ? `${kyc?.id_type_label ?? "Documents"} under review — usually within one business day` : rejected ? kyc?.reason || "Please resubmit clearer photos" : "Photograph a valid ID and take a quick selfie",
      onPress: idDone || pending ? undefined : () => setFormOpen(true),
      cta: rejected ? "Resubmit" : "Start",
      badge: pending ? <IdentityBadge status="pending" /> : rejected ? <IdentityBadge status="rejected" /> : undefined,
    },
  ];
  if (user?.is_agent) {
    steps.push({ done: mandateDone, icon: "ribbon", title: "Verified Mandated Agent", caption: mandateDone ? "Approved by AMASS" : idDone ? "Granted once AMASS reviews a mandate on one of your listings" : "Unlocks after your identity is verified" });
  }
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
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
          <LinearGradient
            colors={idDone ? (isDark ? ["#0F2A1D", "#0A1F16"] : ["#0B3B2A", "#052E1F"]) : pending ? (isDark ? ["#2A2210", "#1C170A"] : ["#3B2F0B", "#2E2405"]) : isDark ? ["#1F1D1A", "#141210"] : ["#1A1816", "#0A0A0A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
            testID="idv-hero"
          >
            <View style={styles.heroBadge}>
              <Ionicons name={idDone ? "shield-checkmark" : pending ? "time" : rejected ? "alert-circle" : "shield-outline"} size={28} color="#fff" />
            </View>
            <AppText variant="h2" color="#fff" testID="idv-hero-title">
              {mandateDone ? "Verified Mandated Agent" : idDone ? "Identity verified" : pending ? "Documents under review" : rejected ? "Needs another look" : "Build trust with verification"}
            </AppText>
            <AppText variant="bodySm" color="rgba(255,255,255,0.75)">
              {idDone
                ? "Your identity is verified. Buyers, sellers and neighbours see your verified badge across AMASS."
                : pending
                  ? `We received your ${kyc?.id_type_label ?? "ID"} and selfie. The AMASS trust team reviews most submissions within one business day.`
                  : rejected
                    ? kyc?.reason || "Your last submission couldn't be verified. Please resubmit clear, well-lit photos."
                    : "Verified members win more trust — and it's required to market properties as an agent."}
            </AppText>
            <View style={{ gap: 6, marginTop: 4 }}>
              <ProgressBar value={verifiedCount / 3} tone={idDone ? "fix" : "mass"} height={6} style={{ backgroundColor: "rgba(255,255,255,0.18)" }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <AppText variant="micro" color="rgba(255,255,255,0.7)" uppercase>
                  {verifiedCount} of 3 steps complete
                </AppText>
                <Badge label={meta.label} tone={status === "none" ? "neutral" : meta.tone} icon={meta.icon} size="xs" testID="idv-status-badge" />
              </View>
            </View>
          </LinearGradient>

          {error ? (
            <Card tone="soft">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                  Couldn&apos;t load your verification status.
                </AppText>
                <Button label="Retry" size="xs" variant="secondary" onPress={() => load()} />
              </View>
            </Card>
          ) : null}

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
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <AppText variant="title">{s.title}</AppText>
                        {s.badge ?? (current ? <Badge label="Next step" tone="brand" size="xs" /> : null)}
                      </View>
                      <AppText variant="caption" tone="tertiary" numberOfLines={3}>
                        {s.caption}
                      </AppText>
                    </View>
                    {s.done ? (
                      <Badge label="Done" tone="success" icon="checkmark-circle" size="xs" />
                    ) : s.onPress ? (
                      <Button label={s.cta ?? "Start"} size="sm" variant={current ? "primary" : "secondary"} onPress={s.onPress} testID={`idv-step-cta-${i}`} />
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </View>

          {/* Submitted photos (pending / approved / rejected) */}
          {status !== "none" && !formOpen ? (
            <Card style={{ gap: 12 }} testID="idv-submitted">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <AppText variant="h3">Your submission</AppText>
                <IdentityBadge status={status} size="sm" />
              </View>
              <AppText variant="caption" tone="secondary">
                {kyc?.id_type_label ?? "ID"}
                {kyc?.submitted_at ? ` · sent ${new Date(kyc.submitted_at).toLocaleDateString()}` : ""}
                {kyc?.reviewed_at ? ` · reviewed ${new Date(kyc.reviewed_at).toLocaleDateString()}` : ""}
              </AppText>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <PhotoField label="ID document" value={kyc?.id_document_url} readOnly height={120} icon="card-outline" testID="idv-sub-id" />
                </View>
                <View style={{ flex: 1 }}>
                  <PhotoField label="Selfie" value={kyc?.selfie_url} readOnly height={120} icon="person-outline" testID="idv-sub-selfie" />
                </View>
              </View>
              {rejected ? <Button label="Resubmit documents" variant="primary" iconLeft="refresh" fullWidth onPress={() => setFormOpen(true)} testID="idv-resubmit" /> : null}
            </Card>
          ) : null}

          {/* Submission form */}
          {formOpen && !idDone && !pending ? (
            <Card style={{ gap: space[4] }} testID="idv-form">
              <View style={{ gap: 4 }}>
                <AppText variant="h3">Verify your identity</AppText>
                <AppText variant="caption" tone="secondary">
                  Takes about two minutes. Your photos are stored privately and only reviewed by the AMASS trust team.
                </AppText>
              </View>

              <View style={{ gap: 8 }}>
                <AppText variant="title">Which ID will you use?</AppText>
                <View style={styles.chips}>
                  {idTypes.map((t) => (
                    <Chip key={t.key} label={t.label} selected={idType === t.key} onPress={() => setIdType(t.key)} testID={`idv-type-${t.key}`} />
                  ))}
                </View>
              </View>

              <Input label="Last 4 digits of the ID number (optional)" placeholder="e.g. 4821" value={last4} onChangeText={(v) => setLast4(v.replace(/[^0-9A-Za-z]/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} testID="idv-last4" />

              <PhotoField label="Photo of your ID" hint="All four corners visible, no glare. The gallery is fine if you already have a clear photo." icon="card-outline" value={idPhoto} onChange={setIdPhoto} testID="idv-id" />

              <PhotoField label="Selfie" hint="Face the camera in good light, no hat or sunglasses — we match it to your ID." icon="person-outline" value={selfie} onChange={setSelfie} preferCamera testID="idv-selfie" />

              <View style={[styles.info, { backgroundColor: colors.infoSoft }]}>
                <Ionicons name="lock-closed" size={16} color={colors.info} />
                <AppText variant="caption" color={colors.info} style={{ flex: 1 }}>
                  Encrypted in transit and at rest. Never shown to other members — only your verified badge is.
                </AppText>
              </View>

              <Button label={submitting ? "Sending…" : "Submit for review"} variant="primary" size="lg" fullWidth iconLeft="shield-checkmark" loading={submitting} disabled={!canSubmit} onPress={submit} testID="idv-submit" />
              <Button label="Not now" variant="ghost" size="sm" fullWidth onPress={() => setFormOpen(false)} testID="idv-cancel" />
            </Card>
          ) : null}

          {!formOpen && status === "none" ? <Button label="Verify my identity" variant="primary" size="lg" fullWidth iconLeft="shield-checkmark" onPress={() => setFormOpen(true)} testID="idv-cta" /> : null}
          {idDone && user?.is_agent && !mandateDone ? <Button label="Open my listings" variant="secondary" size="lg" fullWidth iconLeft="briefcase-outline" onPress={() => router.push("/agent-dashboard" as any)} testID="idv-cta" /> : null}
          {idDone && !user?.is_agent ? <Button label="Become a verified agent" variant="secondary" size="lg" fullWidth iconLeft="ribbon-outline" onPress={() => router.push("/become-agent")} testID="idv-cta" /> : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: 20, gap: 10, overflow: "hidden" },
  heroBadge: { width: 52, height: 52, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stepIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  info: { flexDirection: "row", gap: 10, padding: 12, borderRadius: radii.md, alignItems: "center" },
});
