/**
 * My Home hub — shared visual bits. Big colourful tiles, status colours, due rows, file thumbnails, the
 * add sheet and the home switcher. Everything reads from the theme so light / dark stay in step.
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import dayjs from "dayjs";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Chip, PressableScale, Sheet, type IconName } from "@/src/ui";
import { authedImageSource } from "@/src/lib/pickImage";
import type { DueItem, DueStatus, FileRef, Home } from "@/src/lib/homeHub";

/* ─── Sections ──────────────────────────────────────────────────────────── */
export type SectionKey = "bills" | "records" | "items" | "repairs" | "saved" | "calendar";
export type SectionMeta = { key: SectionKey; label: string; icon: IconName; color: string; soft: string; text: string; route: string };

export function useSections(): Record<SectionKey, SectionMeta> {
  const { colors } = useTheme();
  return {
    bills: { key: "bills", label: "Bills", icon: "receipt", color: colors.market, soft: colors.marketSoft, text: colors.marketText, route: "/home/bills" },
    records: { key: "records", label: "Records", icon: "folder", color: colors.info, soft: colors.infoSoft, text: colors.info, route: "/home/records" },
    items: { key: "items", label: "Items", icon: "cube", color: colors.declutter, soft: colors.declutterSoft, text: colors.declutterText, route: "/home/items" },
    repairs: { key: "repairs", label: "Repairs", icon: "hammer", color: colors.brand, soft: colors.brandSoft, text: colors.brandText, route: "/home/repairs" },
    saved: { key: "saved", label: "Saved", icon: "heart", color: colors.mass, soft: colors.massSoft, text: colors.massText, route: "/saved-properties" },
    calendar: { key: "calendar", label: "Calendar", icon: "calendar", color: colors.success, soft: colors.successSoft, text: colors.success, route: "/home/calendar" },
  };
}

/* ─── Status ────────────────────────────────────────────────────────────── */
export type StatusMeta = { color: string; soft: string; label: string; icon: IconName; onColor: string };

export function useStatusMeta() {
  const { colors } = useTheme();
  return (status: DueStatus | string, daysUntil?: number | null): StatusMeta => {
    switch (status) {
      case "overdue":
        return { color: colors.error, soft: colors.errorSoft, label: daysUntil != null && daysUntil < 0 ? `${-daysUntil}d overdue` : "Overdue", icon: "alert-circle", onColor: "#FFFFFF" };
      case "due_soon":
        return { color: colors.warning, soft: colors.warningSoft, label: daysUntil === 0 ? "Due today" : daysUntil === 1 ? "Due tomorrow" : daysUntil != null ? `Due in ${daysUntil}d` : "Due soon", icon: "time", onColor: "#1A1200" };
      case "paid":
        return { color: colors.success, soft: colors.successSoft, label: "Paid", icon: "checkmark-circle", onColor: "#FFFFFF" };
      case "done":
        return { color: colors.success, soft: colors.successSoft, label: "Done", icon: "checkmark-circle", onColor: "#FFFFFF" };
      case "archived":
        return { color: colors.textMuted, soft: colors.surfaceAlt, label: "Archived", icon: "archive", onColor: "#FFFFFF" };
      case "none":
        return { color: colors.textTertiary, soft: colors.surfaceAlt, label: "No date", icon: "ellipse-outline", onColor: "#FFFFFF" };
      default:
        return { color: colors.info, soft: colors.infoSoft, label: daysUntil != null ? `In ${daysUntil}d` : "Upcoming", icon: "calendar", onColor: "#FFFFFF" };
    }
  };
}

/* ─── Formatting ────────────────────────────────────────────────────────── */
export function naira(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

export function nairaShort(n?: number | null): string {
  if (n == null) return "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `₦${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m`;
  if (a >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return naira(n);
}

export function fmtDate(d?: string | null, withYear = false): string {
  if (!d) return "";
  const x = dayjs(d.slice(0, 10));
  return withYear || x.year() !== dayjs().year() ? x.format("D MMM YYYY") : x.format("ddd D MMM");
}

export function dueText(d?: string | null, today?: string): string {
  if (!d) return "";
  const t = dayjs(today ?? dayjs().format("YYYY-MM-DD"));
  const diff = dayjs(d.slice(0, 10)).diff(t, "day");
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days ago`;
  if (diff <= 14) return `In ${diff} days`;
  return fmtDate(d);
}

export const BILL_CATEGORIES: { key: string; label: string }[] = [
  { key: "rent", label: "Rent" },
  { key: "electricity", label: "Electricity" },
  { key: "water", label: "Water" },
  { key: "internet", label: "Internet" },
  { key: "tv", label: "TV / Cable" },
  { key: "waste", label: "Waste" },
  { key: "security", label: "Security" },
  { key: "estate_dues", label: "Estate dues" },
  { key: "gas", label: "Gas" },
  { key: "generator", label: "Generator / Fuel" },
  { key: "insurance", label: "Insurance" },
  { key: "loan", label: "Loan / Mortgage" },
  { key: "phone", label: "Phone" },
  { key: "subscription", label: "Subscription" },
  { key: "school", label: "School fees" },
  { key: "other", label: "Other" },
];
export const RECORD_FOLDERS: { key: string; label: string }[] = [
  { key: "receipts", label: "Receipts" },
  { key: "agreements", label: "Agreements" },
  { key: "property", label: "Property documents" },
  { key: "warranties", label: "Warranties" },
  { key: "utility", label: "Utility bills" },
  { key: "other", label: "Other" },
];
export const ROOMS = ["Living room", "Bedroom", "Kitchen", "Bathroom", "Dining", "Office", "Kids' room", "Balcony", "Garage", "Store", "Outdoor", "Other"];
export const REPAIR_TRADES = ["Plumbing", "Electrical", "AC Repair", "Generator", "Cleaning", "Pest Control", "Painting", "Carpentry", "Roofing", "Tiling", "CCTV & Security", "Solar", "Gardening", "Pool Maintenance", "Handyman", "Other"];
export const HOME_COLORS = ["#E11B22", "#F97316", "#D4AF37", "#2E8B57", "#14B8A6", "#4F46E5", "#111111"];
export const HOME_KINDS: { key: string; label: string }[] = [
  { key: "flat", label: "Flat" },
  { key: "house", label: "House" },
  { key: "duplex", label: "Duplex" },
  { key: "land", label: "Land" },
  { key: "office", label: "Office" },
  { key: "shop", label: "Shop" },
  { key: "other", label: "Other" },
];

export const BILL_ICON: Record<string, IconName> = {
  rent: "home",
  electricity: "flash",
  water: "water",
  internet: "wifi",
  tv: "tv",
  waste: "trash",
  security: "shield",
  estate_dues: "business",
  gas: "flame",
  generator: "battery-charging",
  insurance: "umbrella",
  loan: "cash",
  phone: "call",
  subscription: "repeat",
  school: "school",
  other: "receipt",
};
export const FOLDER_ICON: Record<string, IconName> = { receipts: "receipt", agreements: "document-text", property: "home", warranties: "shield-checkmark", utility: "flash", other: "folder" };
export const ROOM_ICON: Record<string, IconName> = { "Living room": "tv", Bedroom: "bed", Kitchen: "restaurant", Bathroom: "water", Dining: "wine", Office: "laptop", "Kids' room": "happy", Balcony: "sunny", Garage: "car", Store: "cube", Outdoor: "leaf", Other: "cube" };
export const TRADE_ICON: Record<string, IconName> = { Plumbing: "water", Electrical: "flash", "AC Repair": "snow", Generator: "battery-charging", Cleaning: "sparkles", "Pest Control": "bug", Painting: "color-palette", Carpentry: "hammer", Roofing: "home", Tiling: "grid", "CCTV & Security": "videocam", Solar: "sunny", Gardening: "leaf", "Pool Maintenance": "water", Handyman: "construct", Other: "construct" };
export const DUE_TYPE_ICON: Record<DueItem["type"], IconName> = { bill: "receipt", repair: "hammer", record: "document-text", item: "cube", payment: "checkmark-circle", repair_done: "checkmark-done-circle" };

/* ─── Big tile ──────────────────────────────────────────────────────────── */
export function HubTile({ meta, caption, count, onPress, style, testID }: { meta: SectionMeta; caption?: string; count?: number; onPress: () => void; style?: ViewStyle; testID?: string }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.95} accessibilityRole="button" accessibilityLabel={`${meta.label}${caption ? `. ${caption}` : ""}`} testID={testID} style={[styles.tile, { backgroundColor: meta.color }, style]}>
      <View style={styles.tileSheen} pointerEvents="none" />
      <View style={styles.tileTop}>
        <View style={styles.tileIcon}>
          <Ionicons name={meta.icon} size={30} color="#FFFFFF" />
        </View>
        {typeof count === "number" ? (
          <View style={styles.tileCount}>
            <AppText variant="caption" color={meta.color} tabular>
              {count > 99 ? "99+" : count}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="title" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 21, lineHeight: 26 }}>
          {meta.label}
        </AppText>
        <AppText variant="caption" color="rgba(255,255,255,0.86)" numberOfLines={1}>
          {caption ?? " "}
        </AppText>
      </View>
    </PressableScale>
  );
}

/* ─── Status pill / dot ─────────────────────────────────────────────────── */
export function StatusPill({ status, daysUntil, label, size = "sm", testID }: { status: DueStatus | string; daysUntil?: number | null; label?: string; size?: "xs" | "sm"; testID?: string }) {
  const m = useStatusMeta()(status, daysUntil);
  const text = label ?? m.label;
  return (
    <View style={[styles.pill, size === "xs" && styles.pillXs, { backgroundColor: m.soft }]} testID={testID} accessibilityLabel={text}>
      <Ionicons name={m.icon} size={size === "xs" ? 12 : 14} color={m.color} />
      <AppText variant={size === "xs" ? "micro" : "caption"} color={m.color} numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );
}

/** Warranty pill wording: active → "Under warranty", expiring → "Warranty ends in Nd", expired → "Warranty ended". `short` fits card corners. */
export function warrantyPill(status: "none" | "expired" | "expiring" | "active", days?: number | null, short = false): { status: DueStatus; label: string } {
  if (status === "expired") return { status: "overdue", label: short ? "Warranty ended" : days != null && days < 0 ? `Warranty ended ${-days}d ago` : "Warranty ended" };
  if (status === "expiring") return { status: "due_soon", label: days === 0 ? (short ? "Ends today" : "Warranty ends today") : days != null ? (short ? `Ends in ${days}d` : `Warranty ends in ${days}d`) : "Warranty ending" };
  return { status: "paid", label: short ? "Covered" : days != null ? `Under warranty · ${days}d left` : "Under warranty" };
}

/** Document expiry pill wording: valid → "Valid · Nd left", expiring → "Expires in Nd", expired → "Expired". */
export function expiryPill(status: "none" | "expired" | "expiring" | "valid", days?: number | null): { status: DueStatus; label: string } {
  if (status === "expired") return { status: "overdue", label: days != null && days < 0 ? `Expired ${-days}d ago` : "Expired" };
  if (status === "expiring") return { status: "due_soon", label: days === 0 ? "Expires today" : days != null ? `Expires in ${days}d` : "Expiring soon" };
  return { status: "upcoming", label: days != null ? `Valid · ${days}d left` : "Valid" };
}

/* ─── Due row — hub strip, calendar agenda, lists ───────────────────────── */
export function DueRow({ item, today, icon, onPress, onQuickDone, quickLabel = "Paid", busy, last, testID }: { item: DueItem; today?: string; icon?: IconName; onPress: () => void; onQuickDone?: () => void; quickLabel?: string; busy?: boolean; last?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const m = useStatusMeta()(item.status, item.date ? dayjs(item.date).diff(dayjs(today ?? dayjs().format("YYYY-MM-DD")), "day") : null);
  const typeIcon = icon ?? (item.type === "bill" ? BILL_ICON[item.category ?? "other"] ?? "receipt" : item.type === "repair" ? TRADE_ICON[item.trade ?? "Other"] ?? "hammer" : DUE_TYPE_ICON[item.type]);
  const canQuick = !!onQuickDone && (item.type === "bill" || item.type === "repair") && item.status !== "paid" && item.status !== "done";
  return (
    <View style={[styles.dueRow, !last && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]} testID={testID}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${m.label}. Open`} style={({ pressed }) => [styles.dueMain, pressed && { opacity: 0.8 }]}>
        <View style={[styles.dueIcon, { backgroundColor: m.color }]}>
          <Ionicons name={typeIcon} size={22} color={m.onColor} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {item.title}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <AppText variant="caption" color={m.color} numberOfLines={1}>
              {m.label}
            </AppText>
            {item.subtitle ? (
              <AppText variant="caption" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                · {item.subtitle}
              </AppText>
            ) : null}
          </View>
        </View>
        {!canQuick ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </Pressable>
      {canQuick ? (
        <Pressable onPress={onQuickDone} disabled={busy} accessibilityRole="button" accessibilityLabel={`Mark ${item.title} ${quickLabel.toLowerCase()}`} hitSlop={6} style={({ pressed }) => [styles.quick, { backgroundColor: colors.successSoft, borderColor: colors.success, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]} testID={testID ? `${testID}-quick` : undefined}>
          <Ionicons name="checkmark" size={20} color={colors.success} />
          <AppText variant="micro" color={colors.success}>
            {quickLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ─── File thumbnail (private files need the bearer header) ─────────────── */
export function FileThumb({ file, size = 56, radius = radii.md, style, testID }: { file?: FileRef | null; size?: number | "fill"; radius?: number; style?: ViewStyle; testID?: string }) {
  const { colors } = useTheme();
  const [src, setSrc] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const isImage = !!file?.content_type?.startsWith("image/") || /\.(jpe?g|png|webp|heic|gif)$/i.test(file?.path ?? "");
  useEffect(() => {
    let alive = true;
    if (file?.url && isImage) authedImageSource(file.url).then((s) => alive && setSrc(s));
    else setSrc(null);
    return () => {
      alive = false;
    };
  }, [file?.url, isImage]);
  const dims = size === "fill" ? { width: "100%" as const, height: "100%" as const } : { width: size, height: size };
  if (src) return <Image source={src} style={[dims, { borderRadius: radius }, style as any]} contentFit="cover" transition={150} cachePolicy="memory-disk" testID={testID} />;
  const isPdf = file?.content_type === "application/pdf" || /\.pdf$/i.test(file?.path ?? "");
  return (
    <View style={[dims, { borderRadius: radius, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }, style]} testID={testID}>
      <Ionicons name={file ? (isPdf ? "document-text" : "document") : "image-outline"} size={size === "fill" ? 40 : Math.max(18, (size as number) * 0.42)} color={file ? colors.textSecondary : colors.textMuted} />
    </View>
  );
}

/* ─── Chip row ──────────────────────────────────────────────────────────── */
export function ChipRow<T extends string>({ options, value, onChange, tone, testIDPrefix, allowClear }: { options: { key: T; label: string; icon?: IconName }[]; value: T | null; onChange: (v: T) => void; tone?: "default" | "brand" | "fix" | "mass"; testIDPrefix?: string; allowClear?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: space[4] }} keyboardShouldPersistTaps="handled">
      {options.map((o) => (
        <Chip key={o.key} label={o.label} icon={o.icon} selected={value === o.key} tone={tone} onPress={() => (allowClear && value === o.key ? onChange(null as unknown as T) : onChange(o.key))} testID={testIDPrefix ? `${testIDPrefix}-${o.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined} />
      ))}
    </ScrollView>
  );
}

/* ─── Option grid (big tap targets for the add sheet / pickers) ─────────── */
export function BigOption({ icon, label, caption, color, onPress, testID }: { icon: IconName; label: string; caption?: string; color: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.95} accessibilityRole="button" accessibilityLabel={`${label}${caption ? `. ${caption}` : ""}`} testID={testID} style={[styles.bigOpt, { backgroundColor: colors.surfaceAlt }]}>
      <View style={[styles.bigOptIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={28} color="#FFFFFF" />
      </View>
      <AppText variant="title" numberOfLines={1} style={{ fontSize: 18 }}>
        {label}
      </AppText>
      {caption ? (
        <AppText variant="caption" tone="secondary" numberOfLines={2} align="center">
          {caption}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

/* ─── Add sheet ─────────────────────────────────────────────────────────── */
export function AddSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (kind: "bill" | "record" | "item" | "repair") => void }) {
  const s = useSections();
  return (
    <Sheet visible={visible} onClose={onClose} title="Add to My Home" testID="home-add-sheet">
      <View style={styles.optGrid}>
        <BigOption icon={s.bills.icon} label="Bill" caption="Rent, light, water…" color={s.bills.color} onPress={() => onPick("bill")} testID="home-add-bill" />
        <BigOption icon={s.records.icon} label="Record" caption="Receipt or document" color={s.records.color} onPress={() => onPick("record")} testID="home-add-record" />
        <BigOption icon={s.items.icon} label="Item" caption="TV, fridge, AC…" color={s.items.color} onPress={() => onPick("item")} testID="home-add-item" />
        <BigOption icon={s.repairs.icon} label="Repair" caption="Service or fix" color={s.repairs.color} onPress={() => onPick("repair")} testID="home-add-repair" />
      </View>
    </Sheet>
  );
}

/* ─── Home switcher ─────────────────────────────────────────────────────── */
export const HOME_KIND_ICON: Record<string, IconName> = { flat: "business", house: "home", duplex: "home", land: "map", office: "briefcase", shop: "storefront", other: "location" };

export function HomeSwitcherSheet({ visible, homes, selected, onClose, onSelect, onManage, allowAll }: { visible: boolean; homes: Home[]; selected: string | null; onClose: () => void; onSelect: (id: string) => void; onManage: () => void; allowAll?: boolean }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Which home?" testID="home-switcher-sheet">
      <View style={{ gap: 8 }}>
        {allowAll ? (
          <Pressable onPress={() => onSelect("all")} accessibilityRole="button" accessibilityState={{ selected: selected === "all" }} style={[styles.homeRow, { backgroundColor: selected === "all" ? colors.brandSoft : colors.surfaceAlt }]} testID="home-switch-all">
            <View style={[styles.homeDot, { backgroundColor: colors.text }]}>
              <Ionicons name="albums" size={18} color={colors.bg} />
            </View>
            <AppText variant="bodyMedium" style={{ flex: 1 }}>
              All homes
            </AppText>
            {selected === "all" ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : null}
          </Pressable>
        ) : null}
        {homes.map((h) => (
          <Pressable key={h.id} onPress={() => onSelect(h.id)} accessibilityRole="button" accessibilityState={{ selected: selected === h.id }} style={[styles.homeRow, { backgroundColor: selected === h.id ? colors.brandSoft : colors.surfaceAlt }]} testID={`home-switch-${h.id}`}>
            <View style={[styles.homeDot, { backgroundColor: h.color }]}>
              <Ionicons name={HOME_KIND_ICON[h.kind] ?? "home"} size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {h.name}
              </AppText>
              {h.address ? (
                <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                  {h.address}
                </AppText>
              ) : null}
            </View>
            {h.is_default ? <Badge label="Default" tone="neutral" size="xs" /> : null}
            {selected === h.id ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : null}
          </Pressable>
        ))}
        <Pressable onPress={onManage} accessibilityRole="button" style={[styles.homeRow, { borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" }]} testID="home-switch-manage">
          <View style={[styles.homeDot, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <Ionicons name="add" size={20} color={colors.text} />
          </View>
          <AppText variant="bodyMedium" style={{ flex: 1 }}>
            Add or edit homes
          </AppText>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </Sheet>
  );
}

/* ─── Small labelled value for detail screens ───────────────────────────── */
export function Fact({ icon, label, value, testID }: { icon: IconName; label: string; value?: string | null; testID?: string }) {
  const { colors } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.fact} testID={testID}>
      <Ionicons name={icon} size={18} color={colors.textTertiary} />
      <AppText variant="caption" tone="tertiary" style={{ width: 92 }}>
        {label}
      </AppText>
      <AppText variant="bodySm" style={{ flex: 1 }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { minHeight: 136, borderRadius: radii.xl, padding: 16, justifyContent: "space-between", overflow: "hidden" },
  tileSheen: { position: "absolute", left: 0, right: 0, top: 0, height: "55%", backgroundColor: "rgba(255,255,255,0.14)" },
  tileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  tileIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.24)", alignItems: "center", justifyContent: "center" },
  tileCount: { minWidth: 30, height: 30, paddingHorizontal: 9, borderRadius: 15, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radii.pill, alignSelf: "flex-start" },
  pillXs: { height: 22, paddingHorizontal: 8, gap: 4 },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  dueMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  dueIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  quick: { minWidth: 56, height: 52, paddingHorizontal: 10, borderRadius: radii.md, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 1 },
  optGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  bigOpt: { width: "47.5%", minHeight: 132, borderRadius: radii.lg, padding: 14, alignItems: "center", justifyContent: "center", gap: 8 },
  bigOptIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  homeRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 60, borderRadius: radii.lg },
  homeDot: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  fact: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
});
