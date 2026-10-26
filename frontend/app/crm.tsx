import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Card, Chip, EmptyState, IconButton, Input, Screen, ScreenHeader, SkeletonRows, useToast, type BadgeTone, type IconName } from "@/src/ui";

const STATUS_META: Record<string, { label: string; tone: BadgeTone; icon: IconName }> = {
  new: { label: "New", tone: "info", icon: "sparkles" },
  contacted: { label: "Contacted", tone: "premium", icon: "call" },
  inspection_scheduled: { label: "Inspection", tone: "mass", icon: "calendar" },
  negotiating: { label: "Negotiating", tone: "brand", icon: "chatbubbles" },
  won: { label: "Won", tone: "success", icon: "trophy" },
  lost: { label: "Lost", tone: "neutral", icon: "close-circle" },
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
  const { colors } = useTheme();
  const toast = useToast();
  const [filter, setFilter] = useState<string | undefined>("open");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await api.crmListLeads(filter);
      setLeads(list as Lead[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const setLeadStatus = async (lead: Lead, status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await api.crmUpdateLead(lead.id, { status });
      setSelected((prev) => (prev && prev.id === lead.id ? { ...prev, status, crm_status: status } : prev));
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status, crm_status: status } : l)));
      toast.success(`Marked as ${STATUS_META[status]?.label ?? status}`);
    } catch (e: any) {
      toast.error("Couldn't update status", e?.message ?? "Try again");
    }
  };

  const addNote = async () => {
    if (!selected || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await api.crmAddNote(selected.id, noteText.trim());
      setSelected((prev) => (prev ? { ...prev, crm_notes: [...(prev.crm_notes || []), res.note], last_contact_at: res.note.created_at } : prev));
      setNoteText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't save note", e?.message ?? "Try again");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <Screen testID="crm-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Leads CRM" subtitle={leads.length ? `${leads.length} in view` : "Pipeline"} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow} style={{ flexGrow: 0, flexShrink: 0, minHeight: 52 }}>
        {FILTERS.map((f) => (
          <Chip key={f.label} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} testID={`crm-filter-${f.id ?? "all"}`} />
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={5} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load leads" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space[4], paddingBottom: insets.bottom + 40, gap: space[3] }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.text}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {leads.length === 0 ? (
            <EmptyState icon="people-outline" title="No leads in this bucket yet" body="Unlocked leads and inspection requests will appear here so you can track every deal." testID="crm-empty" />
          ) : (
            leads.map((l) => {
              const meta = STATUS_META[l.status || "new"] || STATUS_META.new;
              return (
                <Card key={l.id} onPress={() => setSelected(l)} elevation="xs" testID={`crm-lead-${l.id}`}>
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    {l.property_image ? (
                      <Image source={{ uri: l.property_image }} style={[styles.leadImage, { backgroundColor: colors.skeleton }]} />
                    ) : (
                      <View style={[styles.leadImage, { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="business" size={20} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <AppText variant="title" numberOfLines={1}>
                        {l.contact_name || "AMASS Buyer"}
                      </AppText>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Badge label={meta.label} tone={meta.tone} icon={meta.icon} size="xs" />
                        <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                          {l.property_title || "Property"}
                        </AppText>
                      </View>
                      {l.property_price ? (
                        <AppText variant="bodyMedium" weight="bold" tabular>
                          {formatNaira(l.property_price)}
                        </AppText>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Detail sheet */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheetHeader, { paddingTop: Platform.OS === "ios" ? space[3] : insets.top + space[2], borderBottomColor: colors.divider }]}>
            <IconButton icon="close" label="Close" onPress={() => setSelected(null)} testID="crm-detail-close" />
            <AppText variant="title">Lead details</AppText>
            <View style={{ width: 44 }} />
          </View>

          {selected && (
            <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
              {selected.property_title && (
                <Card onPress={() => selected.property_id && router.push(`/property/${selected.property_id}`)} elevation="xs" testID="crm-detail-property">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    {selected.property_image ? <Image source={{ uri: selected.property_image }} style={[styles.propertyThumb, { backgroundColor: colors.skeleton }]} /> : null}
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="title" numberOfLines={2}>
                        {selected.property_title}
                      </AppText>
                      {selected.property_price ? (
                        <AppText variant="bodyMedium" weight="bold" tabular>
                          {formatNaira(selected.property_price)}
                        </AppText>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </Card>
              )}

              {(selected.contact_phone || selected.contact_email) && (
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {selected.contact_phone ? <Badge label={selected.contact_phone} icon="call" size="md" /> : null}
                  {selected.contact_email ? <Badge label={selected.contact_email} icon="mail" size="md" /> : null}
                </View>
              )}

              <View style={{ gap: space[2] }}>
                <AppText variant="label" tone="tertiary" uppercase>
                  Status
                </AppText>
                <View style={styles.statusGrid}>
                  {Object.entries(STATUS_META).map(([id, meta]) => {
                    const active = selected.status === id;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => setLeadStatus(selected, id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        testID={`crm-status-${id}`}
                        style={({ pressed }) => [
                          styles.statusBtn,
                          { backgroundColor: active ? colors.surfaceInverse : colors.surface, borderColor: active ? colors.surfaceInverse : colors.border },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Ionicons name={meta.icon} size={14} color={active ? colors.textInverse : colors.textSecondary} />
                        <AppText variant="caption" weight="bold" color={active ? colors.textInverse : colors.text}>
                          {meta.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: space[2] }}>
                <AppText variant="label" tone="tertiary" uppercase>
                  Notes
                </AppText>
                {(selected.crm_notes || []).length === 0 && (
                  <AppText variant="bodySm" tone="tertiary">
                    Add follow-up notes to keep your team in sync.
                  </AppText>
                )}
                {(selected.crm_notes || []).map((n) => (
                  <View key={n.id} style={[styles.noteRow, { backgroundColor: colors.surfaceAlt }]}>
                    <AppText variant="body">{n.text}</AppText>
                    <AppText variant="micro" tone="tertiary">
                      {n.author_name || "You"} · {new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </AppText>
                  </View>
                ))}

                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  <Input containerStyle={{ flex: 1 }} value={noteText} onChangeText={setNoteText} placeholder="Add a note or follow-up…" multiline testID="crm-note-input" />
                  <IconButton icon="send" variant="primary" label="Save note" size={50} onPress={addNote} disabled={!noteText.trim() || savingNote} testID="crm-note-send" />
                </View>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filtersRow: { gap: 8, paddingHorizontal: space[4], paddingBottom: space[3], alignItems: "center" },
  leadImage: { width: 56, height: 56, borderRadius: radii.sm },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[3], paddingBottom: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  propertyThumb: { width: 56, height: 56, borderRadius: radii.sm },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 40, borderRadius: radii.pill, borderWidth: 1.5 },
  noteRow: { padding: 12, borderRadius: radii.sm, gap: 4 },
});
