/**
 * Form building blocks for My Home: a shell with sticky Save, schedule / reminder chips, home picker,
 * money input and an attachment tile. Built for ≤ 3 taps: pick a chip, type one number, Save.
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Chip, Input, Screen, ScreenHeader, type IconName } from "@/src/ui";
import type { FileRef, Freq, Home, Schedule } from "@/src/lib/homeHub";
import { ChipRow, FileThumb, HOME_KIND_ICON } from "./HomeBits";

export function FormShell({ title, subtitle, children, onSave, saveLabel = "Save", saving, disabled, onDelete, deleteLabel, testID, footerNote }: { title: string; subtitle?: string; children: React.ReactNode; onSave: () => void; saveLabel?: string; saving?: boolean; disabled?: boolean; onDelete?: () => void; deleteLabel?: string; testID?: string; footerNote?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  return (
    <Screen testID={testID}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home" as any))} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 160, gap: space[5] }} keyboardShouldPersistTaps="handled" bottomOffset={96}>
        {children}
        {onDelete ? <Button label={deleteLabel ?? "Delete"} variant="destructive" iconLeft="trash-outline" onPress={onDelete} testID={testID ? `${testID}-delete` : undefined} /> : null}
      </KeyboardAwareScrollView>
      <View style={[styles.sticky, shadows.lg, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.bgElevated }]}>
        {footerNote ? (
          <AppText variant="micro" tone="tertiary" align="center">
            {footerNote}
          </AppText>
        ) : null}
        <Button label={saveLabel} size="lg" fullWidth loading={saving} disabled={disabled} iconLeft="checkmark" onPress={onSave} testID={testID ? `${testID}-save` : "form-save"} />
      </View>
    </Screen>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label" tone="secondary" uppercase>
        {label}
      </AppText>
      {children}
      {hint ? (
        <AppText variant="micro" tone="tertiary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** ₦ amount — digits only, formats with thousands separators while typing. */
export function MoneyInput({ label = "Amount (₦)", value, onChange, placeholder = "0", testID, autoFocus }: { label?: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string; testID?: string; autoFocus?: boolean }) {
  const text = value == null ? "" : Math.round(value).toLocaleString("en-NG");
  return (
    <Input
      label={label}
      value={text}
      onChangeText={(t) => {
        const digits = t.replace(/[^0-9]/g, "");
        onChange(digits ? Number(digits) : null);
      }}
      placeholder={placeholder}
      keyboardType="number-pad"
      inputMode="numeric"
      iconLeft="cash-outline"
      size="lg"
      autoFocus={autoFocus}
      testID={testID}
    />
  );
}

const FREQS: { key: Freq; label: string; icon?: IconName }[] = [
  { key: "once", label: "Once" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
  { key: "custom", label: "Custom" },
];

export function ScheduleChips({ value, onChange, onceLabel, testIDPrefix = "sched" }: { value: Schedule; onChange: (s: Schedule) => void; onceLabel?: string; testIDPrefix?: string }) {
  const { colors } = useTheme();
  const opts = FREQS.map((f) => (f.key === "once" && onceLabel ? { ...f, label: onceLabel } : f));
  return (
    <View style={{ gap: 10 }}>
      <ChipRow options={opts} value={value.freq} onChange={(freq) => onChange({ freq, interval: freq === "custom" ? value.interval ?? 1 : 1, unit: value.unit ?? "months" })} testIDPrefix={testIDPrefix} />
      {value.freq === "custom" ? (
        <View style={[styles.custom, { backgroundColor: colors.surfaceAlt }]} testID={`${testIDPrefix}-custom-panel`}>
          <AppText variant="bodySm">Every</AppText>
          <View style={styles.stepper}>
            <Pressable onPress={() => onChange({ ...value, interval: Math.max(1, (value.interval ?? 1) - 1) })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fewer" style={[styles.stepBtn, { backgroundColor: colors.surface }]} testID={`${testIDPrefix}-minus`}>
              <Ionicons name="remove" size={20} color={colors.text} />
            </Pressable>
            <AppText variant="title" tabular style={{ minWidth: 28, textAlign: "center" }} testID={`${testIDPrefix}-interval`}>
              {value.interval ?? 1}
            </AppText>
            <Pressable onPress={() => onChange({ ...value, interval: Math.min(365, (value.interval ?? 1) + 1) })} hitSlop={8} accessibilityRole="button" accessibilityLabel="More" style={[styles.stepBtn, { backgroundColor: colors.surface }]} testID={`${testIDPrefix}-plus`}>
              <Ionicons name="add" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" }}>
            {(["days", "weeks", "months"] as const).map((u) => (
              <Chip key={u} label={u} selected={(value.unit ?? "months") === u} onPress={() => onChange({ ...value, unit: u })} testID={`${testIDPrefix}-unit-${u}`} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const REMINDER_OPTS = [
  { key: 0, label: "On the day" },
  { key: 1, label: "1 day before" },
  { key: 3, label: "3 days before" },
  { key: 7, label: "1 week before" },
  { key: 14, label: "2 weeks before" },
  { key: 30, label: "1 month before" },
];

export function ReminderChips({ value, onChange, options = REMINDER_OPTS, testIDPrefix = "remind" }: { value: number[]; onChange: (v: number[]) => void; options?: { key: number; label: string }[]; testIDPrefix?: string }) {
  const toggle = (k: number) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k].sort((a, b) => b - a));
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <Chip key={o.key} label={o.label} icon={value.includes(o.key) ? "notifications" : undefined} selected={value.includes(o.key)} onPress={() => toggle(o.key)} testID={`${testIDPrefix}-${o.key}`} />
      ))}
    </View>
  );
}

export function HomePicker({ homes, value, onChange, testIDPrefix = "pick-home" }: { homes: Home[]; value: string | null; onChange: (id: string) => void; testIDPrefix?: string }) {
  if (homes.length < 2) return null;
  return (
    <Field label="Which home">
      <ChipRow options={homes.map((h) => ({ key: h.id, label: h.name, icon: HOME_KIND_ICON[h.kind] ?? "home" }))} value={value} onChange={onChange} testIDPrefix={testIDPrefix} />
    </Field>
  );
}

/** Attachment tile: shows the picked file (or progress) and lets the user swap / remove it. */
export function AttachmentTile({ file, previewUri, progress, onAdd, onRemove, label = "Add photo or file", testID }: { file?: FileRef | null; previewUri?: string | null; progress?: number | null; onAdd: () => void; onRemove?: () => void; label?: string; testID?: string }) {
  const { colors } = useTheme();
  const uploading = progress != null && progress < 1;
  const isImage = !!file?.content_type?.startsWith("image/") || (!file && !!previewUri);
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={onAdd} disabled={uploading} accessibilityRole="button" accessibilityLabel={file ? "Replace attachment" : label} style={({ pressed }) => [styles.attach, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }, pressed && { opacity: 0.85 }]} testID={testID}>
        {file || previewUri ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            {previewUri && isImage ? <Image source={{ uri: previewUri }} style={{ width: 64, height: 64, borderRadius: radii.md }} contentFit="cover" accessibilityIgnoresInvertColors /> : <FileThumb file={file} size={64} radius={radii.md} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {file?.name || "Attachment"}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {uploading ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : file ? "Saved privately · tap to replace" : "Ready"}
              </AppText>
            </View>
            <Ionicons name="swap-horizontal" size={20} color={colors.textMuted} />
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            <View style={[styles.attachIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="camera" size={24} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyMedium">{label}</AppText>
              <AppText variant="caption" tone="secondary">
                Camera, library or a PDF — private to you
              </AppText>
            </View>
            <Ionicons name="add-circle" size={26} color={colors.brand} />
          </View>
        )}
      </Pressable>
      {file && onRemove && !uploading ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" style={{ alignSelf: "flex-start" }} testID={testID ? `${testID}-remove` : undefined}>
          <AppText variant="caption" tone="error">
            Remove attachment
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 12, gap: 8, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
  custom: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.md, flexWrap: "wrap" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  attach: { flexDirection: "row", alignItems: "center", minHeight: 76, padding: 12, borderRadius: radii.lg, borderWidth: 1, borderStyle: "dashed" },
  attachIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
