/**
 * Admin Settings — Feature Flags + Property Types + Verification Config
 * Phase D-1 UI. Reuses admin RBAC (`user.is_admin`) client-side; backend
 * enforces `require_admin` on every mutation.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { usePropertyTypes, invalidatePropertyTypesCache } from "@/src/hooks/usePropertyTypes";
import { useTheme } from "@/src/theme";
import { fontFamilies, radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, EmptyState, Input, ListRow, RowGroup, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";

export default function AdminSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [flags, setFlags] = useState<Record<string, boolean> | null>(null);
  const [flagsError, setFlagsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { types, refresh: refreshTypes } = usePropertyTypes();
  const [editType, setEditType] = useState<any | null>(null);

  const load = useCallback(async () => {
    setFlagsError(false);
    try {
      const f = await api.featureFlags();
      setFlags(f);
    } catch {
      setFlagsError(true);
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
      toast.success(`${k.replace(/_/g, " ")} ${next[k] ? "enabled" : "disabled"}`);
    } catch (e: any) {
      setFlags(flags); // revert
      toast.error("Update failed", e?.message ?? "Try again");
    } finally {
      setBusyKey(null);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Settings" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to change platform settings." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const flagEntries = flags ? Object.entries(flags) : [];

  return (
    <Screen testID="admin-settings">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Platform settings" subtitle="Flags · property types · scoring" />
      <ScrollView
        contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); refreshTypes(); }} tintColor={colors.text} />}
      >
        {/* Feature Flags */}
        <RowGroup title="Feature flags">
          {!flags && !flagsError ? (
            <View style={{ padding: space[4] }}>
              <SkeletonRows rows={3} />
            </View>
          ) : flagsError ? (
            <EmptyState variant="error" compact title="Couldn't load flags" actionLabel="Retry" onAction={load} />
          ) : (
            flagEntries.map(([k, v], i) => (
              <ListRow
                key={k}
                icon={v ? "toggle" : "toggle-outline"}
                iconTone={v ? "success" : "default"}
                label={k.replace(/_/g, " ")}
                caption={k}
                last={i === flagEntries.length - 1}
                showChevron={false}
                trailing={
                  busyKey === k ? (
                    <ActivityIndicator color={colors.textTertiary} />
                  ) : (
                    <Switch
                      value={v}
                      onValueChange={() => toggleFlag(k)}
                      trackColor={{ true: colors.success, false: colors.surfaceSunken }}
                      thumbColor="#FFFFFF"
                      accessibilityLabel={`Toggle ${k.replace(/_/g, " ")}`}
                      testID={`flag-${k}`}
                    />
                  )
                }
              />
            ))
          )}
        </RowGroup>

        {/* Property Types */}
        <RowGroup title="Property types">
          {types.map((t, i) => (
            <ListRow
              key={t.slug}
              leading={
                <View style={[styles.colorSwatch, { backgroundColor: t.color }]}>
                  <Ionicons name={t.icon as any} size={16} color="#fff" />
                </View>
              }
              label={t.label}
              caption={`${t.color} · ${t.subtypes.length} subtype${t.subtypes.length === 1 ? "" : "s"}${t.is_system ? " · system" : ""}`}
              trailing={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {!t.active ? <Badge label="Inactive" tone="warning" size="xs" /> : null}
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              }
              onPress={() => setEditType(t)}
              last={i === types.length - 1}
              testID={`type-${t.slug}`}
            />
          ))}
        </RowGroup>

        {/* Related admin links */}
        <RowGroup title="Advanced">
          <ListRow icon="git-compare-outline" label="Duplicate thresholds" caption="possible / high-confidence" onPress={() => router.push("/admin/settings/duplicate" as any)} />
          <ListRow icon="shield-checkmark-outline" iconTone="success" label="Verification weights" caption="Scoring config for VERIFIED status" onPress={() => router.push("/admin/settings/verification" as any)} />
          <ListRow icon="pricetag-outline" iconTone="info" label="Google Places pricing" caption="Estimated USD per call type" onPress={() => router.push("/admin/settings/google" as any)} />
          <ListRow icon="analytics-outline" iconTone="premium" label="Valuation config" caption="Min comparables · radius · confidence" onPress={() => router.push("/admin/settings/valuation" as any)} last />
        </RowGroup>
      </ScrollView>

      <EditTypeSheet
        type={editType}
        onClose={() => setEditType(null)}
        onSaved={() => { setEditType(null); invalidatePropertyTypesCache(); refreshTypes(); }}
      />
    </Screen>
  );
}

function EditTypeSheet({ type, onClose, onSaved }: { type: any | null; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [subtypesText, setSubtypesText] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!type) return;
    setLabel(type.label);
    setColor(type.color);
    setSubtypesText((type.subtypes ?? []).join(", "));
    setActive(!!type.active);
  }, [type]);

  const colorValid = /^#[0-9A-Fa-f]{6}$/.test(color);

  const save = async () => {
    if (!type) return;
    if (!colorValid) return;
    setBusy(true);
    try {
      await api.adminPatchPropertyType(type.slug, {
        label,
        color,
        subtypes: subtypesText.split(",").map((s) => s.trim()).filter(Boolean),
        active,
      });
      toast.success("Property type saved");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!type} onClose={() => { if (!busy) onClose(); }} title={type?.label ?? ""}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        <View style={{ alignItems: "center", paddingVertical: 4 }}>
          <View style={[styles.previewChip, { backgroundColor: colorValid ? color : colors.surfaceSunken }]}>
            <Ionicons name={type?.icon as any} size={20} color="#fff" />
            <AppText variant="title" color="#fff">{label || "Label"}</AppText>
          </View>
        </View>
        <Input label="Label" value={label} onChangeText={setLabel} testID="type-label" />
        <Input
          label="Colour (hex)"
          value={color}
          onChangeText={setColor}
          autoCapitalize="none"
          autoCorrect={false}
          error={color && !colorValid ? "Use hex format #RRGGBB" : null}
          testID="type-color"
          style={{ fontFamily: fontFamilies.medium }}
        />
        <Input
          label="Subtypes (comma-separated slugs)"
          value={subtypesText}
          onChangeText={setSubtypesText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          testID="type-subtypes"
        />
        <Pressable
          onPress={() => setActive((a) => !a)}
          accessibilityRole="switch"
          accessibilityState={{ checked: active }}
          style={[styles.activeRow, { backgroundColor: colors.surfaceAlt }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyMedium">Active</AppText>
            <AppText variant="caption" tone="tertiary">Inactive types are hidden from listing forms</AppText>
          </View>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.success, false: colors.surfaceSunken }} thumbColor="#FFFFFF" />
        </Pressable>
        <Button label="Save changes" size="lg" fullWidth iconLeft="checkmark" loading={busy} disabled={!label.trim() || !colorValid} onPress={save} testID="save-type" style={{ marginTop: 4 }} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  colorSwatch: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  previewChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, height: 44, borderRadius: radii.pill },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.md },
});
