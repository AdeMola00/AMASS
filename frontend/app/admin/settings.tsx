/**
 * Admin Settings — Feature Flags + Property Types + Verification Config
 * Phase D-1 UI. Reuses admin RBAC (`user.is_admin`) client-side; backend
 * enforces `require_admin` on every mutation.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { usePropertyTypes, invalidatePropertyTypesCache } from "@/src/hooks/usePropertyTypes";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [flags, setFlags] = useState<Record<string, boolean> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { types, refresh: refreshTypes } = usePropertyTypes();
  const [editType, setEditType] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const f = await api.featureFlags();
      setFlags(f);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.is_admin) return;
    load();
  }, [user, load]);

  const toggleFlag = async (k: string) => {
    if (!flags) return;
    setBusyKey(k);
    const next = { ...flags, [k]: !flags[k] };
    setFlags(next);
    try {
      await api.adminPatchSetting("feature_flags", next);
    } catch (e: any) {
      setFlags(flags); // revert
      Alert.alert("Update failed", e?.message ?? "Try again");
    } finally {
      setBusyKey(null);
    }
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Settings" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={40} color={colors.red} />
          <Text style={styles.blockedText}>Admins only</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-settings">
      <Header title="Platform Settings" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); refreshTypes(); }} tintColor={colors.red} />}
      >
        {/* Feature Flags */}
        <View style={styles.section}>
          <SectionHeader title="Feature Flags" caption="Toggle systems on/off platform-wide" />
          {!flags ? (
            <ActivityIndicator color={colors.red} />
          ) : (
            Object.entries(flags).map(([k, v]) => (
              <View key={k} style={styles.flagRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.flagLabel}>{k.replace(/_/g, " ")}</Text>
                  <Text style={styles.flagKey}>{k}</Text>
                </View>
                {busyKey === k ? (
                  <ActivityIndicator color={colors.textTertiary} />
                ) : (
                  <Switch
                    value={v}
                    onValueChange={() => toggleFlag(k)}
                    trackColor={{ true: colors.emerald, false: colors.divider }}
                    testID={`flag-${k}`}
                  />
                )}
              </View>
            ))
          )}
        </View>

        {/* Property Types */}
        <View style={styles.section}>
          <SectionHeader title="Property Types" caption="Category colours & subtypes" />
          {types.map((t) => (
            <Pressable
              key={t.slug}
              style={styles.typeRow}
              onPress={() => setEditType(t)}
              testID={`type-${t.slug}`}
            >
              <View style={[styles.colorSwatch, { backgroundColor: t.color }]}>
                <Ionicons name={t.icon as any} size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.typeLabel}>{t.label}</Text>
                <Text style={styles.typeMeta}>
                  {t.color} · {t.subtypes.length} subtype{t.subtypes.length === 1 ? "" : "s"}
                  {t.is_system ? " · system" : ""}
                  {!t.active ? " · inactive" : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>

        {/* Related admin links */}
        <View style={styles.section}>
          <SectionHeader title="Advanced" />
          <LinkRow icon="git-compare-outline" label="Duplicate thresholds" caption="possible / high-confidence" onPress={() => router.push("/admin/settings/duplicate" as any)} />
          <LinkRow icon="shield-checkmark-outline" label="Verification weights" caption="Scoring config for VERIFIED status" onPress={() => router.push("/admin/settings/verification" as any)} />
          <LinkRow icon="pricetag-outline" label="Google Places pricing" caption="Estimated USD per call type" onPress={() => router.push("/admin/settings/google" as any)} />
          <LinkRow icon="analytics-outline" label="Valuation config" caption="Min comparables · radius · confidence" onPress={() => router.push("/admin/settings/valuation" as any)} />
        </View>
      </ScrollView>

      {editType && (
        <EditTypeSheet
          type={editType}
          onClose={() => setEditType(null)}
          onSaved={() => { setEditType(null); invalidatePropertyTypesCache(); refreshTypes(); }}
        />
      )}
    </SafeAreaView>
  );
}

function EditTypeSheet({ type, onClose, onSaved }: { type: any; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(type.label);
  const [color, setColor] = useState(type.color);
  const [subtypesText, setSubtypesText] = useState((type.subtypes ?? []).join(", "));
  const [active, setActive] = useState(!!type.active);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      Alert.alert("Invalid colour", "Use hex format #RRGGBB");
      return;
    }
    setBusy(true);
    try {
      await api.adminPatchPropertyType(type.slug, {
        label,
        color,
        subtypes: subtypesText.split(",").map((s) => s.trim()).filter(Boolean),
        active,
      });
      onSaved();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{type.label}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textTertiary} />
            </Pressable>
          </View>
          <View style={{ alignItems: "center", padding: 8 }}>
            <View style={[styles.previewChip, { backgroundColor: color }]}>
              <Ionicons name={type.icon as any} size={22} color="#fff" />
              <Text style={styles.previewChipText}>{label}</Text>
            </View>
          </View>
          <FieldLbl>Label</FieldLbl>
          <TextInput style={styles.input} value={label} onChangeText={setLabel} />
          <FieldLbl>Colour (hex)</FieldLbl>
          <TextInput style={styles.input} value={color} onChangeText={setColor} autoCapitalize="none" />
          <FieldLbl>Subtypes (comma-separated slugs)</FieldLbl>
          <TextInput
            style={[styles.input, { minHeight: 60, textAlignVertical: "top", paddingTop: 10 }]}
            value={subtypesText}
            onChangeText={setSubtypesText}
            multiline
            autoCapitalize="none"
          />
          <View style={styles.flagRow}>
            <Text style={styles.flagLabel}>Active</Text>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.emerald, false: colors.divider }} />
          </View>
          <Pressable style={[styles.saveBtn, busy && { opacity: 0.5 }]} onPress={save} disabled={busy} testID="save-type">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconBtn} />
    </View>
  );
}
function SectionHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {caption && <Text style={styles.sectionCaption}>{caption}</Text>}
    </View>
  );
}
function FieldLbl({ children }: { children: string }) {
  return <Text style={styles.fieldLbl}>{children}</Text>;
}
function LinkRow({ icon, label, caption, onPress }: { icon: any; label: string; caption: string; onPress: () => void }) {
  return (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <View style={styles.linkIcon}>
        <Ionicons name={icon} size={18} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkLabel}>{label}</Text>
        <Text style={styles.linkCaption}>{caption}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
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
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },
  section: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", gap: 6, ...shadows.soft },
  sectionTitle: { ...typography.h2, fontSize: 15 },
  sectionCaption: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  flagLabel: { fontSize: 13, fontWeight: "700", color: colors.text, textTransform: "capitalize" },
  flagKey: { fontSize: 10, color: colors.textTertiary, marginTop: 2, fontFamily: "monospace" as any },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  typeLabel: { fontSize: 14, fontWeight: "800", color: colors.text },
  typeMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  linkIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  linkLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  linkCaption: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  blockedText: { fontSize: 14, color: colors.text, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard: { maxHeight: "90%", backgroundColor: "#fff", padding: spacing.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, gap: 10 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { ...typography.h2, fontSize: 17 },
  previewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: radius.pill,
  },
  previewChipText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  fieldLbl: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4, marginTop: 8 },
  input: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, fontSize: 13, fontWeight: "600", color: colors.text },
  saveBtn: { height: 48, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
