/**
 * Claim detail — status, what was claimed, photos, the insurer's timeline, and a reply box while it's open.
 */
import React, { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { ApiError } from "@/src/lib/api";
import { newId, uploadFile, type FileRef } from "@/src/lib/homeHub";
import { CLAIM_ICON, CLAIM_TONE, protectApi, type Claim, type ClaimStatus } from "@/src/lib/homeProtect";
import { AppText, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Section, SkeletonRows, useToast, type IconName } from "@/src/ui";
import { Fact, FileThumb, fmtDate, naira } from "@/src/components/home/HomeBits";
import { AttachSheet } from "@/src/components/home/AttachSheet";
import { categoryArt } from "@/src/components/home/homeArt";
import { massFmt, ClaimTimeline } from "@/src/components/home/ProtectBits";

const STEPS: ClaimStatus[] = ["submitted", "under_review", "approved", "paid"];

export default function ClaimScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [missing, setMissing] = useState(false);
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<{ key: string; preview: string; file?: FileRef }[]>([]);
  const [attach, setAttach] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setClaim(await protectApi.claim(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else toast.error("Couldn't load this claim");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const send = async () => {
    if (!claim) return;
    setSending(true);
    try {
      const c = await protectApi.replyClaim(claim.id, { message: message.trim(), photos: photos.map((p) => p.file).filter(Boolean) as FileRef[] });
      setClaim({ ...claim, ...c });
      setMessage("");
      setPhotos([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Sent to the insurer");
    } catch (e: any) {
      toast.error("Couldn't send", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message);
    } finally {
      setSending(false);
    }
  };

  if (missing)
    return (
      <Screen testID="claim-missing">
        <ScreenHeader title="Claim" onBack={() => router.back()} />
        <EmptyState title="Claim not found" body="It may belong to another account." actionLabel="Back to Home Protect" onAction={() => router.replace("/home/protect" as any)} />
      </Screen>
    );
  if (!claim)
    return (
      <Screen testID="claim-loading">
        <ScreenHeader title="Claim" onBack={() => router.back()} />
        <SkeletonRows rows={6} />
      </Screen>
    );

  const tone = CLAIM_TONE[claim.status];
  const soft = tone === "success" || tone === "mass" ? colors.successSoft : tone === "warning" ? colors.warningSoft : tone === "error" ? colors.errorSoft : tone === "info" ? colors.infoSoft : colors.surfaceAlt;
  const strong = tone === "success" || tone === "mass" ? colors.success : tone === "warning" ? colors.warning : tone === "error" ? colors.error : tone === "info" ? colors.info : colors.textSecondary;
  const stepIdx = claim.status === "rejected" ? -1 : claim.status === "more_info" ? 1 : STEPS.indexOf(claim.status);
  const canReply = claim.is_open;

  return (
    <Screen testID="claim-screen">
      <ScreenHeader title={claim.claim_no} subtitle={`${claim.policy_no} · ${claim.plan_name ?? ""}`} onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/protect" as any))} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 60, gap: space[4] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: soft }]} testID="claim-hero">
          <View style={[styles.heroIcon, { backgroundColor: strong }]}>
            <Ionicons name={CLAIM_ICON[claim.status] as IconName} size={28} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="title" testID="claim-status">
              {claim.status_label}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {claim.status === "paid" && claim.payout_mass ? `${massFmt(claim.payout_mass)} paid to your wallet` : claim.status === "approved" && claim.payout_ngn ? `${naira(claim.payout_ngn)} approved · payout on its way` : claim.status === "more_info" ? "Reply below with what the insurer asked for" : claim.status === "rejected" ? "See the insurer's note below" : `Updated ${fmtDate(claim.updated_at, true)}`}
            </AppText>
          </View>
        </View>

        {claim.status !== "rejected" ? (
          <View style={styles.steps} testID="claim-steps">
            {STEPS.map((s, i) => {
              const done = i <= stepIdx;
              return (
                <View key={s} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                  <View style={[styles.stepDot, { backgroundColor: done ? colors.success : colors.surfaceAlt }]}>{done ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}</View>
                  <AppText variant="micro" tone={done ? "primary" : "tertiary"} align="center" numberOfLines={1}>
                    {s === "under_review" ? "Reviewed" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </AppText>
                </View>
              );
            })}
          </View>
        ) : null}

        {claim.admin_note && (claim.status === "rejected" || claim.status === "more_info") ? (
          <View style={[styles.note, { backgroundColor: soft }]} testID="claim-admin-note">
            <Ionicons name="chatbubble-ellipses" size={16} color={strong} />
            <AppText variant="bodySm" style={{ flex: 1 }}>
              {claim.admin_note}
            </AppText>
          </View>
        ) : null}

        <Card elevation="xs" style={{ gap: 2 }} testID="claim-facts">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 8 }}>
            {claim.item_photo ? <FileThumb file={claim.item_photo} size={52} radius={radii.md} /> : <Image source={categoryArt(null)} style={{ width: 52, height: 52, borderRadius: radii.md }} contentFit="cover" accessibilityIgnoresInvertColors />}
            <View style={{ flex: 1 }}>
              <AppText variant="bodyMedium">{claim.item_name ?? (claim.scope === "building" ? "The building" : "Household items")}</AppText>
              <AppText variant="caption" tone="secondary">
                {claim.incident_label} · {fmtDate(claim.incident_date, true)}
              </AppText>
            </View>
          </View>
          <Fact icon="chatbox-ellipses-outline" label="What happened" value={claim.description} />
          <Fact icon="cash-outline" label="Estimated loss" value={claim.amount_claimed_ngn ? naira(claim.amount_claimed_ngn) : "Not given"} />
          {claim.payout_ngn ? <Fact icon="wallet-outline" label="Payout" value={`${naira(claim.payout_ngn)} = ${massFmt(claim.payout_mass)}`} /> : null}
          <Fact icon="shield-checkmark-outline" label="Insurer" value={claim.partner_name} />
          <Fact icon="calendar-outline" label="Submitted" value={fmtDate(claim.created_at, true)} />
        </Card>
        {claim.coverage_warning ? (
          <View style={[styles.note, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="alert-circle" size={16} color={colors.warning} />
            <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
              {claim.coverage_warning}
            </AppText>
          </View>
        ) : null}

        {claim.photos.length ? (
          <Section title="Photos" caption={`${claim.photos.length} attached`}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {claim.photos.map((p, i) => (
                <FileThumb key={`${p.path}-${i}`} file={p} size={110} radius={radii.lg} />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        <Section title="Progress" caption="Every step, newest first">
          <Card elevation="xs">
            <ClaimTimeline claim={claim} />
          </Card>
        </Section>

        {canReply ? (
          <Card elevation="xs" style={{ gap: 10 }} testID="claim-reply">
            <AppText variant="bodyMedium">Add to this claim</AppText>
            <Input value={message} onChangeText={setMessage} placeholder={claim.status === "more_info" ? "Reply to the insurer's request…" : "Anything else the insurer should know?"} multiline numberOfLines={3} style={{ minHeight: 76, textAlignVertical: "top" }} testID="claim-reply-text" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {photos.map((p) => (
                <View key={p.key} style={styles.photo}>
                  <Image source={{ uri: p.preview }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                  {!p.file ? (
                    <View style={styles.photoOverlay}>
                      <Ionicons name="cloud-upload" size={14} color="#FFFFFF" />
                    </View>
                  ) : null}
                  <Pressable onPress={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove photo" style={styles.remove}>
                    <Ionicons name="close" size={12} color="#111" />
                  </Pressable>
                </View>
              ))}
              <Button label="Photo" size="sm" variant="ghost" iconLeft="camera-outline" onPress={() => setAttach(true)} testID="claim-reply-photo" />
              <View style={{ flex: 1 }} />
              <Button label="Send" size="sm" iconLeft="send" loading={sending} disabled={(!message.trim() && !photos.some((p) => p.file)) || photos.some((p) => !p.file)} onPress={send} testID="claim-reply-send" />
            </View>
          </Card>
        ) : null}

        {claim.partner?.claims_phone || claim.partner?.claims_email ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            {claim.partner.claims_phone ? <Button label="Call insurer" size="sm" variant="secondary" iconLeft="call-outline" onPress={() => Linking.openURL(`tel:${claim.partner!.claims_phone}`)} style={{ flex: 1 }} testID="claim-call" /> : null}
            {claim.partner.claims_email ? <Button label="Email insurer" size="sm" variant="secondary" iconLeft="mail-outline" onPress={() => Linking.openURL(`mailto:${claim.partner!.claims_email}?subject=${encodeURIComponent(`Claim ${claim.claim_no}`)}`)} style={{ flex: 1 }} testID="claim-email" /> : null}
          </View>
        ) : null}
        <Badge label={`Policy ${claim.policy_no}`} tone="neutral" icon="shield-checkmark-outline" style={{ alignSelf: "center" }} />
      </ScrollView>

      <AttachSheet
        visible={attach}
        onClose={() => setAttach(false)}
        title="Photo for the insurer"
        photosOnly
        onPicked={async (o) => {
          const key = newId();
          setPhotos((ps) => [...ps, { key, preview: o.previewUri }]);
          try {
            const f = await uploadFile(o.input);
            setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, file: f } : p)));
          } catch (e: any) {
            setPhotos((ps) => ps.filter((p) => p.key !== key));
            toast.error("Upload failed", e?.message ?? "Check your connection and try again.");
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radii.xl },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  steps: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 4 },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: radii.md },
  photo: { width: 48, height: 48, borderRadius: radii.sm, overflow: "hidden", backgroundColor: "#eee" },
  photoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  remove: { position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
});
