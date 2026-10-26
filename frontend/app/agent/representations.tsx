/**
 * Agent Representations — Phase 6C
 * Lists this agent's representations across all properties. Each row shows
 * status (PENDING / DOCS_REQUESTED / APPROVED / REJECTED / SUSPENDED / REVOKED)
 * with a CTA to open the claim submission sheet.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, useToast, type BadgeTone, type IconName } from "@/src/ui";

type Rep = {
  id: string;
  representation_type: string;
  status: string;
  property_id: string;
  amass_property_id: string;
  listing_id?: string;
  mandate_type?: string;
  mandate_expiry?: string;
  submitted_at?: string;
  decided_at?: string;
  decision_reason?: string;
  documents?: string[];
  history?: { status: string; at: string; reason?: string }[];
  property?: { state?: string; area?: string; lga?: string; property_type?: string; media_ids?: string[] };
  listing?: { listing_type?: string; price?: number };
};

const STATUS_META: Record<string, { tone: BadgeTone; label: string; caption: string; icon: IconName }> = {
  PENDING: { tone: "warning", label: "Pending", caption: "Awaiting your mandate documents", icon: "time-outline" },
  DOCS_REQUESTED: { tone: "info", label: "Docs requested", caption: "Admin asked for more documents", icon: "document-attach-outline" },
  APPROVED: { tone: "success", label: "Approved", caption: "Mandate approved & live", icon: "checkmark-circle" },
  REJECTED: { tone: "error", label: "Rejected", caption: "Rejected by admin", icon: "close-circle" },
  SUSPENDED: { tone: "neutral", label: "Suspended", caption: "Temporarily suspended", icon: "pause-circle-outline" },
  REVOKED: { tone: "neutral", label: "Revoked", caption: "Mandate revoked", icon: "ban" },
};

const MANDATE_TYPES: { key: "exclusive" | "sole" | "open" | "verbal" | "written"; label: string; icon: IconName }[] = [
  { key: "exclusive", label: "Exclusive", icon: "star" },
  { key: "sole", label: "Sole", icon: "person" },
  { key: "open", label: "Open", icon: "people" },
  { key: "written", label: "Written", icon: "document-text" },
  { key: "verbal", label: "Verbal", icon: "chatbubble-ellipses" },
];

export default function AgentRepresentationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<Rep | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.myRepresentations();
      setReps(r as Rep[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = reps.filter((r) => r.status === "PENDING" || r.status === "DOCS_REQUESTED").length;

  return (
    <Screen testID="reps-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My representations" subtitle={pending ? `${pending} need${pending === 1 ? "s" : ""} your action` : "Mandate status for each property you list"} />

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={5} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load representations" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={reps}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: space[4], gap: 12, paddingBottom: 60 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}
          ListEmptyComponent={
            <EmptyState
              icon="ribbon-outline"
              title="No representations yet"
              body="Every property you submit via the listing wizard shows up here as a pending representation."
              actionLabel="List a property"
              onAction={() => router.push("/agent/onboarding" as any)}
            />
          }
          renderItem={({ item }) => <RepRow rep={item} onOpen={() => setActive(item)} />}
        />
      )}

      <ClaimSheet
        rep={active}
        onClose={() => setActive(null)}
        onSubmitted={() => {
          setActive(null);
          load();
        }}
      />
    </Screen>
  );
}

function RepRow({ rep, onOpen }: { rep: Rep; onOpen: () => void }) {
  const { colors } = useTheme();
  const s = STATUS_META[rep.status] ?? STATUS_META.PENDING;
  const raw = rep.property?.media_ids?.[0];
  // Seeded properties carry placeholder media ids ("data:image/jpeg;base64,PHOTO_000_…") that are not real images.
  const cover = raw && (/^https?:\/\//.test(raw) || (raw.startsWith("data:image/") && raw.length > 200)) ? raw : null;
  const areaStr = [rep.property?.area, rep.property?.lga, rep.property?.state].filter(Boolean).join(", ");
  const needsAction = rep.status === "PENDING" || rep.status === "DOCS_REQUESTED";
  return (
    <Card elevation="xs" onPress={onOpen} style={styles.repRow} testID={`rep-row-${rep.id}`}>
      <View style={[styles.repThumb, { backgroundColor: colors.surfaceAlt }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
        ) : (
          <Ionicons name="home-outline" size={24} color={colors.textMuted} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <AppText variant="caption" tone="tertiary" tabular>{rep.amass_property_id}</AppText>
          <Badge label={s.label} tone={s.tone} icon={s.icon} size="xs" />
        </View>
        <AppText variant="title" numberOfLines={1}>
          {rep.property?.property_type ?? "Property"} · {rep.representation_type.replace(/_/g, " ")}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1}>{areaStr || "—"}</AppText>
        <AppText variant="caption" color={needsAction ? colors.warning : colors.textTertiary} numberOfLines={1}>
          {needsAction ? `${s.caption} · tap to upload` : s.caption}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Card>
  );
}

function ClaimSheet({ rep, onClose, onSubmitted }: { rep: Rep | null; onClose: () => void; onSubmitted: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [mandateType, setMandateType] = useState<Rep["mandate_type"]>(undefined);
  const [expiry, setExpiry] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [documents, setDocuments] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    if (!rep) return;
    setMandateType(rep.mandate_type as any);
    setExpiry(rep.mandate_expiry ?? "");
    setOwnerName("");
    setOwnerPhone("");
    setNotes("");
    setDocuments(rep.documents ?? []);
    setDocError(null);
  }, [rep]);

  const pickDoc = async () => {
    // System Photo Picker — no media-library permission required.
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.5,
      base64: true,
    });
    if (!res.canceled) {
      const uris = res.assets.map((a) => (a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri)).filter(Boolean);
      setDocuments((s) => [...s, ...uris].slice(0, 12));
      setDocError(null);
    }
  };

  const submit = async () => {
    if (!rep) return;
    if (documents.length === 0) {
      setDocError("Upload at least one mandate or authorisation document.");
      return;
    }
    setSubmitting(true);
    try {
      await api.submitClaim(rep.id, {
        representation_type: rep.representation_type as any,
        mandate_type: mandateType as any,
        mandate_expiry: expiry || undefined,
        documents,
        owner_name: ownerName || undefined,
        owner_phone: ownerPhone || undefined,
        notes: notes || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Submitted for review", "Your mandate is now with our team — usually reviewed within 24h.");
      onSubmitted();
    } catch (e: any) {
      toast.error("Couldn't submit", e?.message ?? "Please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const isClosed = rep?.status === "REJECTED" || rep?.status === "REVOKED";
  const s = rep ? STATUS_META[rep.status] ?? STATUS_META.PENDING : STATUS_META.PENDING;
  const dateValid = !expiry || /^\d{4}-\d{2}-\d{2}$/.test(expiry);

  return (
    <Sheet visible={!!rep} onClose={() => { if (!submitting) onClose(); }} title={rep?.amass_property_id ?? ""} testID="claim-sheet">
      {rep && (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 4 }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Badge label={rep.representation_type.replace(/_/g, " ")} tone="neutral" size="md" icon="briefcase-outline" />
            <Badge label={s.label} tone={s.tone} icon={s.icon} size="md" />
          </View>

          {isClosed ? (
            <EmptyState
              compact
              variant="error"
              title={`This representation is ${rep.status.toLowerCase()}`}
              body={rep.decision_reason ? `Admin note: ${rep.decision_reason}` : "Contact support if you believe this was a mistake."}
              actionLabel="Close"
              onAction={onClose}
            />
          ) : (
            <>
              {rep.decision_reason && rep.status === "DOCS_REQUESTED" ? (
                <View style={[styles.notice, { backgroundColor: colors.infoSoft }]}>
                  <Ionicons name="information-circle" size={16} color={colors.info} />
                  <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>Admin note: {rep.decision_reason}</AppText>
                </View>
              ) : null}

              <View style={{ gap: 8 }}>
                <AppText variant="caption" tone="secondary">Mandate type</AppText>
                <View style={styles.chipsWrap}>
                  {MANDATE_TYPES.map((m) => (
                    <Chip key={m.key} label={m.label} icon={m.icon} selected={mandateType === m.key} onPress={() => setMandateType(m.key)} testID={`mandate-${m.key}`} />
                  ))}
                </View>
              </View>

              <Input
                label="Mandate valid until"
                value={expiry}
                onChangeText={setExpiry}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                autoCorrect={false}
                iconLeft="calendar-outline"
                error={!dateValid ? "Use the format YYYY-MM-DD" : null}
                testID="claim-expiry"
              />
              <Input label="Owner / landlord name" value={ownerName} onChangeText={setOwnerName} placeholder="Full name" iconLeft="person-outline" testID="claim-owner-name" />
              <Input
                label="Owner / landlord phone"
                value={ownerPhone}
                onChangeText={setOwnerPhone}
                placeholder="+234…"
                keyboardType="phone-pad"
                iconLeft="call-outline"
                testID="claim-owner-phone"
              />
              <Input
                label="Notes for reviewer · optional"
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Anything the admin should know…"
                testID="claim-notes"
              />

              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <AppText variant="caption" tone="secondary">Documents</AppText>
                  <AppText variant="caption" tone="tertiary" tabular>{documents.length}/12</AppText>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.docsAddBtn,
                    { borderColor: docError ? colors.error : colors.borderStrong, backgroundColor: colors.surfaceAlt },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={pickDoc}
                  accessibilityRole="button"
                  accessibilityLabel="Upload mandate or authorisation letter"
                  testID="claim-add-doc"
                >
                  <Ionicons name="cloud-upload-outline" size={20} color={colors.text} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium">Upload mandate / authorisation letter</AppText>
                    <AppText variant="caption" tone="tertiary">Photos or scans · up to 12 files</AppText>
                  </View>
                </Pressable>
                {docError ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="alert-circle" size={13} color={colors.error} />
                    <AppText variant="caption" tone="error">{docError}</AppText>
                  </View>
                ) : null}
                {documents.length > 0 && (
                  <View style={styles.docsGrid}>
                    {documents.map((d, i) => (
                      <View key={i} style={[styles.docThumb, { backgroundColor: colors.surfaceAlt }]}>
                        <Image source={{ uri: d }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                        <Pressable
                          style={styles.docRemove}
                          onPress={() => setDocuments((s) => s.filter((_, j) => j !== i))}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove document ${i + 1}`}
                        >
                          <Ionicons name="close" size={12} color="#fff" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <Button label="Submit for review" size="lg" fullWidth iconLeft="paper-plane" loading={submitting} disabled={!dateValid} onPress={submit} testID="claim-submit" />
            </>
          )}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  repRow: { flexDirection: "row", gap: 12, alignItems: "center", padding: 12 },
  repThumb: { width: 64, height: 64, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  docsAddBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.md, borderWidth: 1.5, borderStyle: "dashed", minHeight: 56 },
  docsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  docThumb: { width: 80, height: 80, borderRadius: radii.sm, overflow: "hidden", position: "relative" },
  docRemove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
});
