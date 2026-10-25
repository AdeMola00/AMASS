/**
 * Admin · Identity & documents (KYC) review queue.
 * Identity: ID photo + selfie per member → approve / reject (reason required).
 * Documents: title documents per listing → approve / reject. Approvals stamp the public badges.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, type KycQueue } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, SegmentedControl, Sheet, SkeletonRows, StatTile, useToast } from "@/src/ui";
import { AuthedImage } from "@/src/components/common/AuthedImage";

type Tab = "identity" | "documents";
type Status = "pending" | "approved" | "rejected";
type IdentityRow = KycQueue["identity"][number];
type DocRow = KycQueue["documents"][number];
type Target = { kind: "identity"; row: IdentityRow } | { kind: "document"; row: DocRow };

export default function AdminKyc() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("identity");
  const [status, setStatus] = useState<Status>("pending");
  const [queue, setQueue] = useState<KycQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      setQueue(await api.adminKycQueue(status));
    } catch {
      setError(true);
    }
  }, [status]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const closeSheet = () => {
    if (busy) return;
    setTarget(null);
    setReason("");
    setRejecting(false);
  };

  const review = async (approve: boolean) => {
    if (!target) return;
    if (!approve && reason.trim().length < 3) {
      setRejecting(true);
      return;
    }
    setBusy(approve ? "approve" : "reject");
    try {
      if (target.kind === "identity") await api.adminReviewIdentity(target.row.user_id, approve, approve ? undefined : reason.trim());
      else await api.adminReviewDocument(target.row.id, approve, approve ? undefined : reason.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(approve ? "Approved — badge is live" : "Rejected — member notified");
      setQueue((q) => {
        if (!q) return q;
        if (target.kind === "identity") return { ...q, identity: q.identity.filter((r) => r.user_id !== target.row.user_id), counts: { ...q.counts, identity_pending: Math.max(0, q.counts.identity_pending - (status === "pending" ? 1 : 0)) } };
        return { ...q, documents: q.documents.filter((r) => r.id !== target.row.id), counts: { ...q.counts, documents_pending: Math.max(0, q.counts.documents_pending - (status === "pending" ? 1 : 0)) } };
      });
      setBusy(null);
      setTarget(null);
      setReason("");
      setRejecting(false);
    } catch (e: any) {
      setBusy(null);
      toast.error("Review failed", e?.message);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen testID="admin-kyc-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Identity & documents" />
        <EmptyState variant="error" icon="lock-closed" title="Admin access required" body="This area is restricted to AMASS administrators." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const identity = queue?.identity ?? [];
  const documents = queue?.documents ?? [];
  const list = tab === "identity" ? identity : documents;

  return (
    <Screen testID="admin-kyc-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Identity & documents" subtitle="KYC review queue" backTestID="kyc-back" />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          <StatTile icon="person" tone="brand" value={queue?.counts.identity_pending ?? 0} label="Identity pending" testID="kyc-stat-identity" />
          <StatTile icon="document-text" tone="mass" value={queue?.counts.documents_pending ?? 0} label="Documents pending" testID="kyc-stat-docs" />
        </View>

        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          testIDPrefix="kyc-tab"
          options={[
            { value: "identity", label: `Identity (${identity.length})` },
            { value: "documents", label: `Documents (${documents.length})` },
          ]}
        />

        <View style={styles.chips}>
          {(["pending", "approved", "rejected"] as Status[]).map((s) => (
            <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} selected={status === s} onPress={() => setStatus(s)} testID={`kyc-filter-${s}`} />
          ))}
        </View>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : error ? (
          <EmptyState variant="error" title="Couldn't load the queue" actionLabel="Retry" onAction={() => load()} testID="kyc-error" />
        ) : list.length === 0 ? (
          <EmptyState icon={tab === "identity" ? "person-outline" : "document-text-outline"} title={status === "pending" ? "Queue is clear" : `No ${status} ${tab === "identity" ? "identity checks" : "documents"}`} body={status === "pending" ? "New submissions appear here the moment members send them." : undefined} testID="kyc-empty" />
        ) : tab === "identity" ? (
          identity.map((r) => (
            <Card key={r.user_id} elevation="xs" onPress={() => setTarget({ kind: "identity", row: r })} testID={`kyc-identity-${r.user_id}`}>
              <View style={styles.row}>
                <Avatar name={r.full_name} uri={r.avatar_url} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {r.full_name}
                    </AppText>
                    {r.is_agent ? <Badge label="Agent" tone="info" size="xs" /> : null}
                    {r.attempts > 1 ? <Badge label={`Attempt ${r.attempts}`} tone="warning" size="xs" /> : null}
                  </View>
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    {r.id_type_label ?? r.id_type} · {r.email || r.phone || "—"}
                  </AppText>
                  <AppText variant="micro" tone="tertiary">
                    Sent {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </Card>
          ))
        ) : (
          documents.map((d) => (
            <Card key={d.id} elevation="xs" onPress={() => setTarget({ kind: "document", row: d })} testID={`kyc-doc-${d.id}`}>
              <View style={styles.row}>
                <View style={[styles.cover, { backgroundColor: colors.skeleton }]}>{d.property_cover ? <Image source={{ uri: d.property_cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="home" size={20} color={colors.textTertiary} />}</View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title" numberOfLines={1}>
                    {d.kind_label}
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    {d.property_title} · {d.property_location || d.property_city || ""}
                  </AppText>
                  <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                    by {d.agent_name} · {d.submitted_at ? new Date(d.submitted_at).toLocaleDateString() : "—"}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <Sheet visible={!!target} onClose={closeSheet} title={target?.kind === "identity" ? "Identity check" : "Title document"} testID="kyc-review-sheet">
        {target ? (
          <ScrollView contentContainerStyle={{ gap: space[3], paddingBottom: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {target.kind === "identity" ? (
              <>
                <View style={styles.row}>
                  <Avatar name={target.row.full_name} uri={target.row.avatar_url} size={48} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="title">{target.row.full_name}</AppText>
                    <AppText variant="caption" tone="secondary">
                      {target.row.id_type_label}
                      {target.row.email ? ` · ${target.row.email}` : ""}
                      {target.row.phone ? ` · ${target.row.phone}` : ""}
                    </AppText>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Shot label="ID document" url={target.row.id_document_url} testID="kyc-shot-id" />
                  <Shot label="Selfie" url={target.row.selfie_url} testID="kyc-shot-selfie" />
                </View>
                <AppText variant="caption" tone="tertiary">
                  Check: name on the ID matches the account, photo matches the selfie, the ID is in date and all corners are visible.
                </AppText>
              </>
            ) : (
              <>
                <View style={styles.row}>
                  <View style={[styles.cover, { backgroundColor: colors.skeleton }]}>{target.row.property_cover ? <Image source={{ uri: target.row.property_cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="title" numberOfLines={2}>
                      {target.row.property_title}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1}>
                      {target.row.property_location || target.row.property_city || ""} · by {target.row.agent_name}
                    </AppText>
                    <Badge label={target.row.kind_label} tone="mass" size="xs" />
                  </View>
                  <Pressable onPress={() => router.push(`/property/${target.row.property_id}`)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open listing" testID="kyc-open-listing">
                    <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <Shot label={target.row.title || target.row.kind_label} url={target.row.url} tall testID="kyc-shot-doc" />
                <AppText variant="caption" tone="tertiary">
                  Check: document type matches, the property description/address matches the listing, stamps and signatures are legible.
                </AppText>
              </>
            )}

            {(target.kind === "identity" ? target.row.status : target.row.status) === "pending" ? (
              <>
                {rejecting ? <Input label="Reason (shown to the member)" placeholder="e.g. ID photo is blurred — please retake in daylight" value={reason} onChangeText={setReason} multiline maxLength={300} testID="kyc-reason" autoFocus /> : null}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button label={rejecting ? "Confirm reject" : "Reject"} variant="destructive" size="md" iconLeft="close" loading={busy === "reject"} disabled={!!busy || (rejecting && reason.trim().length < 3)} onPress={() => review(false)} style={{ flex: 1 }} testID="kyc-reject" />
                  {!rejecting ? <Button label="Approve" variant="primary" size="md" iconLeft="checkmark" loading={busy === "approve"} disabled={!!busy} onPress={() => review(true)} style={{ flex: 1 }} testID="kyc-approve" /> : <Button label="Back" variant="ghost" size="md" onPress={() => setRejecting(false)} disabled={!!busy} testID="kyc-reject-back" />}
                </View>
              </>
            ) : (
              <View style={[styles.reviewed, { backgroundColor: colors.surfaceAlt }]}>
                <Badge label={target.row.status === "approved" ? "Approved" : "Rejected"} tone={target.row.status === "approved" ? "success" : "error"} size="sm" />
                <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                  {target.row.reviewed_at ? `Reviewed ${new Date(target.row.reviewed_at).toLocaleString()}` : ""}
                  {target.row.reason ? ` · ${target.row.reason}` : ""}
                </AppText>
              </View>
            )}
          </ScrollView>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Shot({ label, url, tall, testID }: { label: string; url?: string | null; tall?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 6 }} testID={testID}>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
      <View style={[styles.shot, { height: tall ? 320 : 170, backgroundColor: colors.surfaceAlt }]}>{url ? <AuthedImage url={url} style={StyleSheet.absoluteFill} contentFit="contain" /> : <Ionicons name="image-outline" size={24} color={colors.textTertiary} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space[3] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  cover: { width: 56, height: 56, borderRadius: radii.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  shot: { borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  reviewed: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
});
