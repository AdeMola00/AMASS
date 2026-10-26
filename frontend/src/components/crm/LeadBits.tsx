/**
 * Leads CRM building blocks shared by the personal CRM (/crm) and the agency team CRM (/agency/leads):
 *  • STATUS_META / FILTERS — pipeline vocabulary
 *  • LeadCard — one row (buyer · status · property · price · assignee)
 *  • LeadDetailSheet — status grid, notes, contact chips and (team CRM only) "Assigned to" picker
 */
import React, { useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, type AgencyMember, type CrmLead } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Card, IconButton, Input, useToast, type BadgeTone, type IconName } from "@/src/ui";

export const STATUS_META: Record<string, { label: string; tone: BadgeTone; icon: IconName }> = {
  new: { label: "New", tone: "info", icon: "sparkles" },
  contacted: { label: "Contacted", tone: "premium", icon: "call" },
  inspection_scheduled: { label: "Inspection", tone: "mass", icon: "calendar" },
  negotiating: { label: "Negotiating", tone: "brand", icon: "chatbubbles" },
  won: { label: "Won", tone: "success", icon: "trophy" },
  lost: { label: "Lost", tone: "neutral", icon: "close-circle" },
};

export const STATUS_FILTERS: { id: string | undefined; label: string }[] = [
  { id: undefined, label: "All" },
  { id: "open", label: "Open" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "inspection_scheduled", label: "Inspection" },
  { id: "negotiating", label: "Negotiating" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

/** The teammate a lead currently sits with (the backend resolves explicit assignee → unlocking agent while on the team). */
export function leadOwner(l: CrmLead) {
  return l.assignee ?? null;
}

export function LeadCard({ lead: l, onPress, showOwner, testID }: { lead: CrmLead; onPress: () => void; showOwner?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const meta = STATUS_META[l.status || "new"] || STATUS_META.new;
  const owner = leadOwner(l);
  return (
    <Card onPress={onPress} elevation="xs" testID={testID ?? `crm-lead-${l.id}`}>
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {l.property_price ? (
              <AppText variant="bodyMedium" weight="bold" tabular style={{ flex: 1 }}>
                {formatNaira(l.property_price)}
              </AppText>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {showOwner ? (
              <View style={styles.ownerPill} testID={`${testID ?? `crm-lead-${l.id}`}-owner`}>
                {owner ? <Avatar name={owner.full_name} uri={owner.avatar_url} size={20} tone="soft" /> : <Ionicons name="person-add-outline" size={14} color={colors.warning} />}
                <AppText variant="micro" tone={owner ? "secondary" : undefined} color={owner ? undefined : colors.warning} numberOfLines={1} style={{ maxWidth: 110 }}>
                  {owner ? (owner.full_name || "Teammate").split(" ")[0] : "Unassigned"}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

export function LeadDetailSheet({
  lead,
  onClose,
  onChange,
  assign,
}: {
  lead: CrmLead | null;
  onClose: () => void;
  /** Called with the updated lead after a status / note / assignment change. */
  onChange: (updated: CrmLead) => void;
  /** Team CRM only — owner/managers pick who works the lead. */
  assign?: { members: AgencyMember[]; canAssign: boolean };
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const setStatus = async (status: string) => {
    if (!lead) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await api.crmUpdateLead(lead.id, { status });
      onChange({ ...lead, status, crm_status: status });
      toast.success(`Marked as ${STATUS_META[status]?.label ?? status}`);
    } catch (e: any) {
      toast.error("Couldn't update status", e?.message ?? "Try again");
    }
  };

  const addNote = async () => {
    if (!lead || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await api.crmAddNote(lead.id, noteText.trim());
      onChange({ ...lead, crm_notes: [...(lead.crm_notes || []), res.note], last_contact_at: res.note.created_at });
      setNoteText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't save note", e?.message ?? "Try again");
    } finally {
      setSavingNote(false);
    }
  };

  const assignTo = async (userId: string | null) => {
    if (!lead || assigning) return;
    setAssigning(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      const r = await api.agencyAssignLead(lead.id, userId);
      onChange(r.lead);
      const who = r.lead.assignee?.full_name;
      toast.success(who ? `Assigned to ${who}` : "Back in the team pool");
    } catch (e: any) {
      toast.error("Couldn't assign", e?.message ?? "Try again");
    } finally {
      setAssigning(false);
    }
  };

  const owner = lead ? leadOwner(lead) : null;
  const teammates = (assign?.members ?? []).filter((m) => m.status === "active" && m.user_id);

  return (
    <Modal visible={!!lead} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheetHeader, { paddingTop: Platform.OS === "ios" ? space[3] : insets.top + space[2], borderBottomColor: colors.divider }]}>
          <IconButton icon="close" label="Close" onPress={onClose} testID="crm-detail-close" />
          <AppText variant="title">Lead details</AppText>
          <View style={{ width: 44 }} />
        </View>

        {lead ? (
          <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 4 }}>
              <AppText variant="h2" testID="crm-detail-buyer">
                {lead.contact_name || "AMASS Buyer"}
              </AppText>
              {lead.created_at ? (
                <AppText variant="caption" tone="tertiary">
                  Unlocked {new Date(lead.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {lead.agent?.full_name ? ` by ${lead.agent.full_name}` : ""}
                </AppText>
              ) : null}
            </View>

            {lead.property_title ? (
              <Card onPress={() => lead.property_id && router.push(`/property/${lead.property_id}` as any)} elevation="xs" testID="crm-detail-property">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {lead.property_image ? <Image source={{ uri: lead.property_image }} style={[styles.propertyThumb, { backgroundColor: colors.skeleton }]} /> : null}
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="title" numberOfLines={2}>
                      {lead.property_title}
                    </AppText>
                    {lead.property_price ? (
                      <AppText variant="bodyMedium" weight="bold" tabular>
                        {formatNaira(lead.property_price)}
                      </AppText>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Card>
            ) : null}

            {lead.contact_phone || lead.contact_email ? (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {lead.contact_phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${lead.contact_phone}`)} accessibilityRole="button" accessibilityLabel={`Call ${lead.contact_phone}`} testID="crm-detail-call">
                    <Badge label={lead.contact_phone} icon="call" size="md" />
                  </Pressable>
                ) : null}
                {lead.contact_email ? (
                  <Pressable onPress={() => Linking.openURL(`mailto:${lead.contact_email}`)} accessibilityRole="button" accessibilityLabel={`Email ${lead.contact_email}`} testID="crm-detail-email">
                    <Badge label={lead.contact_email} icon="mail" size="md" />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {assign ? (
              <View style={{ gap: space[2] }} testID="crm-detail-assign">
                <AppText variant="label" tone="tertiary" uppercase>
                  Assigned to
                </AppText>
                {assign.canAssign ? (
                  <View style={{ gap: 8 }}>
                    {!owner ? (
                      <AppText variant="bodySm" color={colors.warning} testID="crm-assign-hint">
                        Not assigned yet — pick a teammate to work this lead.
                      </AppText>
                    ) : null}
                    <View style={styles.statusGrid}>
                      {teammates.map((m) => {
                        const active = owner?.id === m.user_id;
                        return <AssignChip key={m.id} label={m.user?.full_name || m.email} avatar={m.user} active={active} onPress={() => (active ? null : assignTo(m.user_id!))} disabled={assigning} testID={`crm-assign-${m.user_id}`} />;
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {owner ? <Avatar name={owner.full_name} uri={owner.avatar_url} size={28} tone="soft" /> : null}
                    <AppText variant="bodySm" tone="secondary">
                      {owner ? owner.full_name : "Unassigned — a manager will pick this up"}
                    </AppText>
                  </View>
                )}
              </View>
            ) : null}

            <View style={{ gap: space[2] }}>
              <AppText variant="label" tone="tertiary" uppercase>
                Status
              </AppText>
              <View style={styles.statusGrid}>
                {Object.entries(STATUS_META).map(([id, meta]) => {
                  const active = lead.status === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setStatus(id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      testID={`crm-status-${id}`}
                      style={({ pressed }) => [styles.statusBtn, { backgroundColor: active ? colors.surfaceInverse : colors.surface, borderColor: active ? colors.surfaceInverse : colors.border }, pressed && { opacity: 0.85 }]}
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
              {(lead.crm_notes || []).length === 0 ? (
                <AppText variant="bodySm" tone="tertiary">
                  Add follow-up notes to keep your team in sync.
                </AppText>
              ) : null}
              {(lead.crm_notes || []).map((n) => (
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
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AssignChip({ label, avatar, active, onPress, disabled, testID }: { label: string; avatar?: { full_name?: string | null; avatar_url?: string | null } | null; active: boolean; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: active }} testID={testID} style={({ pressed }) => [styles.statusBtn, { backgroundColor: active ? colors.surfaceInverse : colors.surface, borderColor: active ? colors.surfaceInverse : colors.border, opacity: pressed || disabled ? 0.8 : 1 }]}>
      {avatar ? <Avatar name={avatar.full_name} uri={avatar.avatar_url} size={20} tone={active ? "soft" : "ink"} /> : <Ionicons name="person-remove-outline" size={14} color={active ? colors.textInverse : colors.textSecondary} />}
      <AppText variant="caption" weight="bold" color={active ? colors.textInverse : colors.text} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  leadImage: { width: 56, height: 56, borderRadius: radii.sm },
  ownerPill: { flexDirection: "row", alignItems: "center", gap: 5 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[3], paddingBottom: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  propertyThumb: { width: 56, height: 56, borderRadius: radii.sm },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 40, borderRadius: radii.pill, borderWidth: 1.5 },
  noteRow: { padding: 12, borderRadius: radii.sm, gap: 4 },
});
