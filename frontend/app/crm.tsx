import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

const STATUS_META: Record<
  string,
  { label: string; colour: string; bg: string; icon: any }
> = {
  new: { label: "New", colour: "#0369A1", bg: "#E0F2FE", icon: "sparkles" },
  contacted: { label: "Contacted", colour: "#7C3AED", bg: "#EDE9FE", icon: "call" },
  inspection_scheduled: {
    label: "Inspection",
    colour: "#F59E0B",
    bg: "#FEF3C7",
    icon: "calendar",
  },
  negotiating: {
    label: "Negotiating",
    colour: "#DB2777",
    bg: "#FCE7F3",
    icon: "chatbubbles",
  },
  won: { label: "Won", colour: "#059669", bg: "#D1FAE5", icon: "trophy" },
  lost: { label: "Lost", colour: "#71717A", bg: "#F4F4F5", icon: "close-circle" },
};

const FILTERS: { id: string | undefined; label: string }[] = [
  { id: undefined, label: "All" },
  { id: "open", label: "Open" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "inspection_scheduled", label: "Inspection" },
  { id: "negotiating", label: "Negotiating" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

type Lead = {
  id: string;
  property_id?: string;
  property_title?: string;
  property_image?: string;
  property_price?: number;
  status: string;
  crm_status?: string;
  crm_notes?: { id: string; text: string; author_name?: string; created_at: string }[];
  next_follow_up_at?: string;
  last_contact_at?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  created_at?: string;
};

export default function CRMScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<string | undefined>("open");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = async () => {
    try {
      const list = await api.crmListLeads(filter);
      setLeads(list as Lead[]);
    } catch (e: any) {
      Alert.alert("Could not load leads", e?.message ?? "Try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const setLeadStatus = async (lead: Lead, status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await api.crmUpdateLead(lead.id, { status });
      setSelected((prev) =>
        prev && prev.id === lead.id ? { ...prev, status, crm_status: status } : prev
      );
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status, crm_status: status } : l))
      );
    } catch (e: any) {
      Alert.alert("Could not update status", e?.message ?? "Try again");
    }
  };

  const addNote = async () => {
    if (!selected || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await api.crmAddNote(selected.id, noteText.trim());
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              crm_notes: [...(prev.crm_notes || []), res.note],
              last_contact_at: res.note.created_at,
            }
          : prev
      );
      setNoteText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert("Could not save note", e?.message ?? "Try again");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Leads CRM</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.label}
              onPress={() => setFilter(f.id)}
              style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.red} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.red}
            />
          }
        >
          {leads.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No leads in this bucket yet</Text>
              <Text style={styles.emptySub}>
                Unlocked leads and inspection requests will appear here so you can track every
                deal.
              </Text>
            </View>
          ) : (
            leads.map((l) => {
              const meta = STATUS_META[l.status || "new"] || STATUS_META.new;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => setSelected(l)}
                  style={({ pressed }) => [styles.leadCard, pressed && { opacity: 0.9 }]}
                >
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {l.property_image ? (
                      <Image source={{ uri: l.property_image }} style={styles.leadImage} />
                    ) : (
                      <View style={[styles.leadImage, styles.leadImageFallback]}>
                        <Ionicons name="business" size={20} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.leadName} numberOfLines={1}>
                          {l.contact_name || "AMASS Buyer"}
                        </Text>
                        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={10} color={meta.colour} />
                          <Text style={[styles.statusText, { color: meta.colour }]}>
                            {meta.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.leadProperty} numberOfLines={1}>
                        {l.property_title || "Property"}
                      </Text>
                      <Text style={styles.leadPrice}>
                        {l.property_price ? formatNaira(l.property_price) : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Detail sheet */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.bg }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheetHeader}>
            <Pressable onPress={() => setSelected(null)} style={styles.iconBtn} hitSlop={8}>
              <Ionicons name="close" size={26} color={colors.ink} />
            </Pressable>
            <Text style={styles.headerTitle}>Lead details</Text>
            <View style={styles.iconBtn} />
          </View>

          {selected && (
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
              {selected.property_title && (
                <Pressable
                  style={styles.propertyChip}
                  onPress={() => selected.property_id && router.push(`/property/${selected.property_id}`)}
                >
                  {selected.property_image && (
                    <Image source={{ uri: selected.property_image }} style={styles.propertyThumb} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leadProperty}>{selected.property_title}</Text>
                    {selected.property_price ? (
                      <Text style={styles.leadPrice}>{formatNaira(selected.property_price)}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </Pressable>
              )}

              <Text style={styles.sectionTitle}>Status</Text>
              <View style={styles.statusGrid}>
                {Object.entries(STATUS_META).map(([id, meta]) => {
                  const active = selected.status === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setLeadStatus(selected, id)}
                      style={[
                        styles.statusBtn,
                        { backgroundColor: active ? meta.bg : colors.bg },
                        active && { borderColor: meta.colour, borderWidth: 2 },
                      ]}
                    >
                      <Ionicons name={meta.icon} size={14} color={meta.colour} />
                      <Text style={[styles.statusBtnText, { color: meta.colour }]}>
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>Notes</Text>
              {(selected.crm_notes || []).length === 0 && (
                <Text style={styles.emptySub}>
                  Add follow-up notes to keep your team in sync.
                </Text>
              )}
              {(selected.crm_notes || []).map((n) => (
                <View key={n.id} style={styles.noteRow}>
                  <Text style={styles.noteText}>{n.text}</Text>
                  <Text style={styles.noteMeta}>
                    {n.author_name || "You"} ·{" "}
                    {new Date(n.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              ))}

              <View style={styles.noteInputRow}>
                <TextInput
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="Add a note or follow-up…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.noteInput}
                  multiline
                />
                <Pressable
                  onPress={addNote}
                  disabled={!noteText.trim() || savingNote}
                  style={[styles.noteBtn, (!noteText.trim() || savingNote) && { opacity: 0.5 }]}
                >
                  {savingNote ? (
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Ionicons name="send" size={18} color={colors.bg} />
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h3, color: colors.ink },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  filtersRow: { gap: 6, padding: spacing.md, paddingTop: spacing.sm },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  filterChipActive: { backgroundColor: colors.ink },
  filterText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: colors.bg },

  empty: { alignItems: "center", padding: spacing.xl, gap: 8 },
  emptyTitle: { ...typography.h3, color: colors.ink },
  emptySub: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },

  leadCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  leadImage: { width: 60, height: 60, borderRadius: 10, backgroundColor: colors.surfaceSecondary },
  leadImageFallback: { alignItems: "center", justifyContent: "center" },
  leadName: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  leadProperty: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  leadPrice: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 4 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  propertyChip: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
  },
  propertyThumb: { width: 48, height: 48, borderRadius: 8 },

  sectionTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBtnText: { fontSize: 12, fontWeight: "800" },

  noteRow: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    gap: 4,
  },
  noteText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  noteMeta: { color: colors.textMuted, fontSize: 11 },

  noteInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: spacing.sm,
  },
  noteInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.ink,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  noteBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
});
