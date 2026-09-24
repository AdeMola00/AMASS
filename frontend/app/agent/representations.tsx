/**
 * Agent Representations — Phase 6C
 * Lists this agent's representations across all properties. Each row shows
 * status (PENDING / DOCS_REQUESTED / APPROVED / REJECTED / SUSPENDED / REVOKED)
 * with a CTA to open the claim submission sheet.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

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

const STATUS_STYLES: Record<
  string,
  { color: string; caption: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  PENDING: { color: colors.gold, caption: "Awaiting mandate documents", icon: "time-outline" },
  DOCS_REQUESTED: { color: colors.gold, caption: "Admin requested more documents", icon: "document-attach-outline" },
  APPROVED: { color: colors.emerald, caption: "Mandate approved & live", icon: "checkmark-circle" },
  REJECTED: { color: colors.red, caption: "Rejected by admin", icon: "close-circle" },
  SUSPENDED: { color: colors.textTertiary, caption: "Temporarily suspended", icon: "pause-circle-outline" },
  REVOKED: { color: colors.textTertiary, caption: "Revoked", icon: "ban" },
};

const MANDATE_TYPES: { key: "exclusive" | "sole" | "open" | "verbal" | "written"; label: string }[] = [
  { key: "exclusive", label: "Exclusive" },
  { key: "sole", label: "Sole" },
  { key: "open", label: "Open" },
  { key: "written", label: "Written" },
  { key: "verbal", label: "Verbal" },
];

export default function AgentRepresentationsScreen() {
  const router = useRouter();
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<Rep | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.myRepresentations();
      setReps(r as Rep[]);
    } catch (e: any) {
      Alert.alert("Could not load", e?.message ?? "Please try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="reps-screen">
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle}>My representations</Text>
          <Text style={styles.headerSub}>Mandate & authorisation status for each property you list</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      ) : (
        <FlatList
          data={reps}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.xl, gap: 12, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="ribbon-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No representations yet</Text>
              <Text style={styles.emptySub}>Every property you submit via the wizard shows up here as a PENDING representation.</Text>
              <Pressable style={styles.emptyBtn} onPress={() => router.push("/agent/onboarding" as any)}>
                <Text style={styles.emptyBtnText}>List a property</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <RepRow rep={item} onOpen={() => setActive(item)} />
          )}
        />
      )}

      {active && (
        <ClaimSheet
          rep={active}
          onClose={() => setActive(null)}
          onSubmitted={() => {
            setActive(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function RepRow({ rep, onOpen }: { rep: Rep; onOpen: () => void }) {
  const s = STATUS_STYLES[rep.status] ?? STATUS_STYLES.PENDING;
  const cover = rep.property?.media_ids?.[0];
  const areaStr = [rep.property?.area, rep.property?.lga, rep.property?.state].filter(Boolean).join(", ");
  return (
    <Pressable style={[styles.repRow, shadows.soft]} onPress={onOpen} testID={`rep-row-${rep.id}`}>
      <View style={styles.repThumb}>
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <Ionicons name="home" size={24} color={colors.textMuted} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.repId}>{rep.amass_property_id}</Text>
          <View style={[styles.statusPill, { backgroundColor: s.color }]}>
            <Ionicons name={s.icon} size={10} color="#fff" />
            <Text style={styles.statusPillText}>{rep.status.replace(/_/g, " ")}</Text>
          </View>
        </View>
        <Text style={styles.repTitle}>{rep.property?.property_type ?? "Property"} · {rep.representation_type.replace(/_/g, " ")}</Text>
        <Text style={styles.repArea}>{areaStr || "—"}</Text>
        <Text style={styles.repCaption}>{s.caption}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

function ClaimSheet({
  rep,
  onClose,
  onSubmitted,
}: {
  rep: Rep;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [mandateType, setMandateType] = useState<Rep["mandate_type"]>(rep.mandate_type as any);
  const [expiry, setExpiry] = useState(rep.mandate_expiry ?? "");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [documents, setDocuments] = useState<string[]>(rep.documents ?? []);
  const [submitting, setSubmitting] = useState(false);

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
    }
  };

  const submit = async () => {
    if (documents.length === 0) {
      Alert.alert("Documents required", "Upload at least one mandate or authorisation document.");
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
      Alert.alert("Submitted", "Your mandate is now under review.");
      onSubmitted();
    } catch (e: any) {
      Alert.alert("Could not submit", e?.message ?? "Please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const isClosed = rep.status === "REJECTED" || rep.status === "REVOKED";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{rep.amass_property_id}</Text>
              <Text style={styles.modalSub}>{rep.representation_type.replace(/_/g, " ").toUpperCase()}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textTertiary} />
            </Pressable>
          </View>

          {isClosed ? (
            <View style={styles.closedBox}>
              <Ionicons name="lock-closed" size={22} color={colors.red} />
              <Text style={{ fontSize: 13, color: colors.text, fontWeight: "700", textAlign: "center" }}>
                This representation is {rep.status.toLowerCase()}.
              </Text>
              {rep.decision_reason && (
                <Text style={styles.closedReason}>Admin note: {rep.decision_reason}</Text>
              )}
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 20 }}>
              <Text style={styles.subheader}>Mandate type</Text>
              <View style={styles.chipsWrap}>
                {MANDATE_TYPES.map((m) => {
                  const on = mandateType === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setMandateType(m.key)}
                    >
                      <Text style={[styles.chipText, on && { color: "#fff" }]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Field label="Mandate valid until" value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD" />

              <Field label="Owner / Landlord name" value={ownerName} onChangeText={setOwnerName} placeholder="Full name" />
              <Field
                label="Owner / Landlord phone"
                value={ownerPhone}
                onChangeText={setOwnerPhone}
                placeholder="+234…"
                keyboardType="phone-pad"
              />

              <Text style={styles.subheader}>Notes for reviewer (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                style={[styles.input, { minHeight: 80, textAlignVertical: "top", paddingTop: 12 }]}
                placeholder="Anything the admin should know…"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.subheader}>Documents ({documents.length}/12)</Text>
              <Pressable style={styles.docsAddBtn} onPress={pickDoc}>
                <Ionicons name="cloud-upload-outline" size={18} color={colors.text} />
                <Text style={styles.docsAddText}>Upload mandate / authorisation letter</Text>
              </Pressable>
              {documents.length > 0 && (
                <View style={styles.docsGrid}>
                  {documents.map((d, i) => (
                    <View key={i} style={styles.docThumb}>
                      <Image source={{ uri: d }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                      <Pressable
                        style={styles.docRemove}
                        onPress={() => setDocuments((s) => s.filter((_, j) => j !== i))}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={12} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              <Pressable style={[styles.cta, submitting && { opacity: 0.5 }]} onPress={submit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Submit for review</Text>}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.h2, fontSize: 16 },
  headerSub: { fontSize: 11, color: colors.textTertiary, marginTop: 2, textAlign: "center" },

  repRow: {
    flexDirection: "row",
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 12,
    alignItems: "center",
  },
  repThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  repId: { fontSize: 12, fontWeight: "800", color: colors.text },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusPillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  repTitle: { fontSize: 13, color: colors.text, fontWeight: "700" },
  repArea: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  repCaption: { fontSize: 11, color: colors.textSecondary, fontStyle: "italic" },

  empty: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  emptyTitle: { ...typography.h2, fontSize: 18 },
  emptySub: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },
  emptyBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard: {
    maxHeight: "90%",
    backgroundColor: "#fff",
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: 12,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  modalTitle: { ...typography.h2, fontSize: 18 },
  modalSub: { fontSize: 11, color: colors.textTertiary, fontWeight: "800", letterSpacing: 0.5, marginTop: 2 },

  subheader: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 6,
  },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginLeft: 4 },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
  },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },

  docsAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  docsAddText: { fontSize: 13, fontWeight: "700", color: colors.text },
  docsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  docThumb: {
    width: 80,
    height: 80,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    position: "relative",
  },
  docRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },

  closedBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.redSurface,
    alignItems: "center",
    gap: 8,
  },
  closedReason: { fontSize: 11, color: colors.text, textAlign: "center" },

  cta: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
