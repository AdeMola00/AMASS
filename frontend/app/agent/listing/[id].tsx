/**
 * Manage one listing — real leads (chats · MASS unlocks · inspection requests), title documents
 * (upload → AMASS review → verified badge) and quick status changes. Money is read-only here.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, type DocKind, type ListingLead, type Property, type PropertyDocument, type PropertyDocuments } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { formatNaira } from "@/src/constants/theme";
import { AppText, Avatar, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, SegmentedControl, Sheet, Skeleton, SkeletonRows, StatTile, useToast, type IconName } from "@/src/ui";
import { PromotionBadge } from "@/src/components/PromotionBadge";
import { PhotoField } from "@/src/components/kyc/PhotoField";
import { DocumentsBadge, DOCS_META } from "@/src/components/kyc/badges";
import { AuthedImage } from "@/src/components/common/AuthedImage";
import { LISTING_STATUS_TONE, normalizeStatus, type ListingStatus } from "@/src/components/agent/ListingManagerRow";

type Tab = "leads" | "docs";
type LeadsPayload = Awaited<ReturnType<typeof api.agentListingLeads>>;

const LEAD_META: Record<ListingLead["kind"], { icon: IconName; label: string; tone: "info" | "mass" | "success" }> = {
  chat: { icon: "chatbubble", label: "Chat", tone: "info" },
  unlock: { icon: "lock-open", label: "Unlocked", tone: "mass" },
  inspection: { icon: "clipboard", label: "Inspection", tone: "success" },
};

const STATUS_OPTIONS: { key: ListingStatus; label: string; caption: string; icon: IconName; destructive?: boolean }[] = [
  { key: "available", label: "Available", caption: "Live on the map and in search", icon: "checkmark-circle-outline" },
  { key: "coming_soon", label: "Coming soon", caption: "Visible with a Coming soon tag", icon: "time-outline" },
  { key: "sold", label: "Mark as sold / let", caption: "Hidden from the map; stays in your portfolio", icon: "ribbon-outline", destructive: true },
  { key: "withdrawn", label: "Withdraw", caption: "Hidden everywhere until you relist", icon: "eye-off-outline", destructive: true },
];

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ManageListing() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(tabParam === "docs" ? "docs" : "leads");
  const [property, setProperty] = useState<Property | null>(null);
  const [leads, setLeads] = useState<LeadsPayload | null>(null);
  const [docs, setDocs] = useState<PropertyDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<ListingStatus | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(false);
    try {
      const [p, l, d] = await Promise.all([api.getProperty(id), api.agentListingLeads(id), api.propertyDocuments(id)]);
      setProperty(p);
      setLeads(l);
      setDocs(d);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const applyStatus = async (s: ListingStatus) => {
    if (!id) return;
    setSavingStatus(true);
    try {
      await api.setListingStatus(id, s);
      setProperty((p) => (p ? { ...p, status: s } : p));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(s === "sold" ? "Marked as sold" : s === "withdrawn" ? "Listing withdrawn" : s === "coming_soon" ? "Marked coming soon" : "Listing is live again");
      setConfirmStatus(null);
      setStatusOpen(false);
    } catch (e: any) {
      toast.error("Couldn't update status", e?.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const onPickStatus = (s: ListingStatus) => {
    if (s === "sold" || s === "withdrawn") {
      setConfirmStatus(s);
      return;
    }
    applyStatus(s);
  };

  const status = (property?.status || "available") as string;
  const cover = property?.images?.[0];
  const counts = leads?.counts;
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />;

  return (
    <Screen testID="manage-listing-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Manage listing" subtitle={property?.title} backTestID="manage-back" right={property ? <Button label="View" size="xs" variant="secondary" iconLeft="open-outline" onPress={() => router.push(`/property/${property.id}`)} testID="manage-view-listing" /> : undefined} />

      {loading ? (
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={120} radius={radii.xl} />
          <SkeletonRows rows={4} />
        </View>
      ) : error || !property ? (
        <EmptyState variant="error" title="Couldn't load this listing" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} testID="manage-error" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} refreshControl={refresh} showsVerticalScrollIndicator={false}>
          {/* Header card */}
          <Card padded={false} testID="manage-header">
            <View style={styles.head}>
              <View style={[styles.cover, { backgroundColor: colors.skeleton }]}>{cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="home" size={24} color={colors.textTertiary} />}</View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <Badge label={status.replace("_", " ")} tone={LISTING_STATUS_TONE[status] ?? "neutral"} size="xs" testID="manage-status-badge" />
                  <PromotionBadge promotion={property.promotion} withDays />
                  {docs ? <DocumentsBadge status={docs.documents_status} /> : null}
                </View>
                <AppText variant="title" numberOfLines={2}>
                  {property.title}
                </AppText>
                <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                  {property.location}
                </AppText>
                <AppText variant="title" tabular>
                  {formatNaira(property.price)}
                </AppText>
              </View>
            </View>
            <View style={[styles.headActions, { borderTopColor: colors.divider }]}>
              <Button label="Change status" size="sm" variant="secondary" iconLeft="swap-horizontal-outline" onPress={() => setStatusOpen(true)} style={{ flex: 1 }} testID="manage-change-status" />
              <Button label={property.promotion ? "Extend boost" : "Boost"} size="sm" variant="mass" iconLeft="rocket-outline" onPress={() => router.push(`/agent/boost/${property.id}` as any)} style={{ flex: 1 }} testID="manage-boost" />
            </View>
          </Card>

          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            testIDPrefix="manage-tab"
            options={[
              { value: "leads", label: `Leads (${leads?.leads.length ?? 0})` },
              { value: "docs", label: `Documents (${docs?.documents.length ?? 0})` },
            ]}
          />

          {tab === "leads" ? (
            <View style={{ gap: space[3] }}>
              <View style={styles.stats}>
                <StatTile icon="chatbubble" tone="info" value={counts?.chats ?? 0} label="Chats" testID="manage-stat-chats" />
                <StatTile icon="lock-open" tone="mass" value={counts?.unlocks ?? 0} label="Unlocks" testID="manage-stat-unlocks" />
                <StatTile icon="clipboard" tone="success" value={counts?.inspections ?? 0} label="Inspections" testID="manage-stat-inspections" />
              </View>
              {leads && leads.leads.length > 0 ? (
                leads.leads.map((l) => <LeadRow key={l.id} lead={l} onPress={l.kind === "chat" && l.conversation_id ? () => router.push(`/chat/${l.conversation_id}` as any) : l.kind === "inspection" && l.inspection_id ? () => router.push(`/improve/inspection/${l.inspection_id}` as any) : undefined} />)
              ) : (
                <EmptyState icon="people-outline" title="No leads yet" body="Every chat started from this home, every MASS unlock and every inspection request shows up here." actionLabel={property.promotion ? undefined : "Boost this listing"} onAction={property.promotion ? undefined : () => router.push(`/agent/boost/${property.id}` as any)} testID="manage-leads-empty" />
              )}
            </View>
          ) : (
            <DocumentsPanel propertyId={property.id} docs={docs} onChange={setDocs} onUpload={() => setUploadOpen(true)} />
          )}
        </ScrollView>
      )}

      {/* Status picker */}
      <Sheet visible={statusOpen} onClose={() => (savingStatus ? null : setStatusOpen(false))} title="Listing status" testID="status-sheet">
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {STATUS_OPTIONS.map((o) => {
            const active = normalizeStatus(status) === o.key;
            return (
              <Pressable key={o.key} onPress={() => (active ? setStatusOpen(false) : onPickStatus(o.key))} disabled={savingStatus} accessibilityRole="radio" accessibilityState={{ selected: active }} style={({ pressed }) => [styles.statusRow, { backgroundColor: active ? colors.surfaceAlt : "transparent", borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]} testID={`status-opt-${o.key}`}>
                <View style={[styles.statusIcon, { backgroundColor: o.destructive ? colors.errorSoft : colors.surfaceAlt }]}>
                  <Ionicons name={o.icon} size={18} color={o.destructive ? colors.error : colors.text} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title" color={o.destructive ? colors.error : undefined}>
                    {o.label}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {o.caption}
                  </AppText>
                </View>
                {active ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
              </Pressable>
            );
          })}
          {confirmStatus ? (
            <View style={[styles.confirm, { backgroundColor: colors.errorSoft }]} testID="status-confirm">
              <AppText variant="bodySm" color={colors.error} style={{ flex: 1 }}>
                {confirmStatus === "sold" ? "Mark this home as sold / let? It leaves the map immediately." : "Withdraw this listing? It's hidden everywhere until you set it back to Available."}
              </AppText>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Cancel" size="sm" variant="ghost" onPress={() => setConfirmStatus(null)} disabled={savingStatus} testID="status-confirm-cancel" />
                <Button label={confirmStatus === "sold" ? "Yes, sold" : "Yes, withdraw"} size="sm" variant="destructive" loading={savingStatus} onPress={() => applyStatus(confirmStatus)} testID="status-confirm-yes" />
              </View>
            </View>
          ) : null}
        </View>
      </Sheet>

      {property ? <UploadDocSheet visible={uploadOpen} propertyId={property.id} kinds={docs?.kinds ?? []} onClose={() => setUploadOpen(false)} onUploaded={(doc, flags) => setDocs((d) => (d ? { ...d, documents: [doc, ...d.documents], documents_status: flags.documents_status as PropertyDocuments["documents_status"], documents_verified: flags.documents_verified } : d))} /> : null}
    </Screen>
  );
}

function LeadRow({ lead, onPress }: { lead: ListingLead; onPress?: () => void }) {
  const { colors } = useTheme();
  const m = LEAD_META[lead.kind];
  return (
    <Card elevation="xs" onPress={onPress} testID={`lead-${lead.id}`}>
      <View style={styles.leadRow}>
        <View>
          <Avatar name={lead.name} uri={lead.avatar} size={44} verified={lead.identity_verified} />
          <View style={[styles.leadKind, { backgroundColor: colors.surfaceInverse, borderColor: colors.surface }]}>
            <Ionicons name={m.icon} size={10} color={colors.textInverse} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
              {lead.name}
            </AppText>
            <Badge label={m.label} tone={m.tone} size="xs" />
            {lead.identity_verified ? <Badge label="ID verified" tone="success" icon="shield-checkmark" size="xs" /> : null}
          </View>
          <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
            {lead.detail}
          </AppText>
          <AppText variant="micro" tone="tertiary">
            {timeAgo(lead.at)}
          </AppText>
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
      </View>
    </Card>
  );
}

function DocumentsPanel({ propertyId, docs, onChange, onUpload }: { propertyId: string; docs: PropertyDocuments | null; onChange: (d: PropertyDocuments) => void; onUpload: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PropertyDocument | null>(null);
  const meta = DOCS_META[docs?.documents_status ?? "none"];

  const remove = async (doc: PropertyDocument) => {
    setRemoving(doc.id);
    try {
      const flags = await api.deletePropertyDocument(propertyId, doc.id);
      if (docs) onChange({ ...docs, documents: docs.documents.filter((d) => d.id !== doc.id), documents_status: flags.documents_status as PropertyDocuments["documents_status"], documents_verified: flags.documents_verified });
      toast.success("Document removed");
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error("Couldn't remove", e?.message);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <View style={{ gap: space[3] }} testID="manage-docs">
      <Card tone="soft" style={{ gap: 10 }} testID="docs-summary">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.docsIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name={meta.icon} size={20} color={docs?.documents_verified ? colors.success : colors.text} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title">{meta.label}</AppText>
            <AppText variant="caption" tone="secondary">
              {docs?.documents_verified
                ? `Buyers see a "Title documents verified" badge on this home${docs.verified_documents.length ? ` (${docs.verified_documents.join(", ")})` : ""}.`
                : docs?.documents_status === "pending"
                  ? "The AMASS team is reviewing your upload — usually within one business day."
                  : docs?.documents_status === "rejected"
                    ? "Your last upload wasn't accepted. Check the reason below and upload a clearer copy."
                    : "Upload the C of O, Governor's Consent, survey plan or mandate letter. Verified homes win more trust and unlocks."}
            </AppText>
          </View>
        </View>
        <Button label="Upload a document" variant="primary" size="sm" iconLeft="cloud-upload-outline" onPress={onUpload} testID="docs-upload-btn" />
      </Card>

      {docs && docs.documents.length > 0 ? (
        docs.documents.map((d) => (
          <Card key={d.id} elevation="xs" testID={`doc-${d.id}`} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={[styles.docThumb, { backgroundColor: colors.surfaceAlt }]}>{d.url ? <AuthedImage url={d.url} style={StyleSheet.absoluteFill} /> : <Ionicons name="document-outline" size={22} color={colors.textTertiary} />}</View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge label={d.status === "approved" ? "Verified" : d.status === "pending" ? "In review" : "Not accepted"} tone={d.status === "approved" ? "success" : d.status === "pending" ? "warning" : "error"} icon={d.status === "approved" ? "checkmark-circle" : d.status === "pending" ? "time-outline" : "close-circle"} size="xs" />
                </View>
                <AppText variant="title" numberOfLines={1}>
                  {d.title || d.kind_label}
                </AppText>
                <AppText variant="caption" tone="tertiary">
                  {d.kind_label}
                  {d.submitted_at ? ` · sent ${new Date(d.submitted_at).toLocaleDateString()}` : ""}
                </AppText>
                {d.status === "rejected" && d.reason ? (
                  <AppText variant="caption" color={colors.error}>
                    Reason: {d.reason}
                  </AppText>
                ) : null}
              </View>
              {d.status !== "approved" ? (
                <Pressable onPress={() => setConfirmDelete(d)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${d.kind_label}`} testID={`doc-remove-${d.id}`} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            {confirmDelete?.id === d.id ? (
              <View style={[styles.confirm, { backgroundColor: colors.errorSoft }]} testID="doc-delete-confirm">
                <AppText variant="bodySm" color={colors.error} style={{ flex: 1 }}>
                  Remove this document?
                </AppText>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button label="Cancel" size="xs" variant="ghost" onPress={() => setConfirmDelete(null)} />
                  <Button label="Remove" size="xs" variant="destructive" loading={removing === d.id} onPress={() => remove(d)} testID="doc-delete-yes" />
                </View>
              </View>
            ) : null}
          </Card>
        ))
      ) : (
        <View style={[styles.kindsNote, { backgroundColor: colors.surfaceAlt }]}>
          <AppText variant="caption" tone="secondary">
            Accepted: {(docs?.kinds ?? []).map((k) => k.label).join(" · ")}. A clear photo or scan of each page is enough.
          </AppText>
        </View>
      )}
    </View>
  );
}

function UploadDocSheet({ visible, propertyId, kinds, onClose, onUploaded }: { visible: boolean; propertyId: string; kinds: { key: DocKind; label: string }[]; onClose: () => void; onUploaded: (doc: PropertyDocument, flags: { documents_status: string; documents_verified: boolean }) => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<DocKind>("c_of_o");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kindList = useMemo(() => (kinds.length ? kinds : [{ key: "c_of_o" as DocKind, label: "Certificate of Occupancy" }]), [kinds]);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.uploadPropertyDocument(propertyId, { kind, file, title: title.trim() || undefined });
      const { documents_status, documents_verified, ...doc } = res;
      onUploaded(doc as PropertyDocument, { documents_status, documents_verified });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Document sent for review", "We'll notify you once the AMASS team has checked it.");
      setFile(null);
      setTitle("");
      onClose();
    } catch (e: any) {
      toast.error("Upload failed", e?.message || "Please try a smaller or clearer photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={() => (busy ? null : onClose())} title="Upload a title document" testID="upload-doc-sheet">
      <ScrollView contentContainerStyle={{ gap: space[4], paddingBottom: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ gap: 8 }}>
          <AppText variant="title">Document type</AppText>
          <View style={styles.chips}>
            {kindList.map((k) => (
              <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} testID={`doc-kind-${k.key}`} />
            ))}
          </View>
        </View>
        <Input label="Label (optional)" placeholder="e.g. C of O — page 1" value={title} onChangeText={setTitle} maxLength={80} testID="doc-title" />
        <PhotoField label="Photo or scan" hint="Every page legible, no glare. Documents stay private — buyers only see the verified badge." icon="document-text-outline" value={file} onChange={setFile} testID="doc-file" />
        <Button label={busy ? "Uploading…" : "Send for review"} variant="primary" size="lg" fullWidth iconLeft="cloud-upload-outline" loading={busy} disabled={!file || busy} onPress={submit} testID="doc-submit" />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 12, padding: 12 },
  cover: { width: 92, height: 92, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  headActions: { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  stats: { flexDirection: "row", gap: space[3] },
  leadRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  leadKind: { position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md, borderWidth: 1 },
  statusIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  confirm: { gap: 10, padding: 12, borderRadius: radii.md },
  docsIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  docThumb: { width: 64, height: 64, borderRadius: radii.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  kindsNote: { padding: 12, borderRadius: radii.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
