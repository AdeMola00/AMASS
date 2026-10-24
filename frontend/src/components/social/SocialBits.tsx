/** Shared Nearby-feed pieces — price/status tags, action pills, chips, scope + report sheets (AMASS ink/red). */
import React, { useState } from "react";
import { Pressable, StyleSheet, View, ViewStyle, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { SocialPost, SocialScope } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Button, Input, PressableScale, Sheet, SheetLink } from "@/src/ui";
import { naira, photoUrl, socialFont } from "./socialTheme";

/** FREE (soft green) or ₦ price (ink, bold) + optional "Negotiable". */
export function PriceTag({ post, size = "md", style }: { post: Pick<SocialPost, "kind" | "price" | "negotiable">; size?: "sm" | "md" | "lg"; style?: ViewStyle }) {
  const { colors } = useTheme();
  if (post.kind === "give") {
    return (
      <View style={[styles.freeTag, size === "sm" && styles.freeTagSm, { backgroundColor: colors.successSoft }, style]} accessibilityLabel="Free">
        <Ionicons name="gift" size={size === "sm" ? 12 : 14} color={colors.success} />
        <AppText variant={size === "sm" ? "micro" : "caption"} color={colors.success} style={{ fontFamily: socialFont.black, letterSpacing: 0.4 }}>
          FREE
        </AppText>
      </View>
    );
  }
  return (
    <View style={[{ flexDirection: "row", alignItems: "baseline", gap: 6 }, style]}>
      <AppText tabular style={size === "lg" ? styles.priceLg : size === "sm" ? styles.priceSm : styles.price}>
        {naira(post.price ?? 0)}
      </AppText>
      {post.negotiable ? (
        <AppText variant="micro" tone="tertiary">
          Negotiable
        </AppText>
      ) : null}
    </View>
  );
}

/** Status pill over photos / in lists — Reserved (warning), Gone (ink), Paused (neutral). */
export function StatusTag({ status, kind, style }: { status: SocialPost["status"]; kind: SocialPost["kind"]; style?: ViewStyle }) {
  const { colors } = useTheme();
  if (status === "active") return null;
  const label = status === "gone" ? (kind === "give" ? "Given away" : "Sold") : status === "reserved" ? "Reserved" : status === "paused" ? "Paused" : "Removed";
  const bg = status === "reserved" ? colors.warning : status === "paused" ? colors.surfaceAlt : colors.surfaceInverse;
  const fg = status === "reserved" ? "#111111" : status === "paused" ? colors.text : colors.textInverse;
  return (
    <View style={[styles.statusTag, { backgroundColor: bg }, style]} accessibilityLabel={label}>
      <AppText variant="micro" color={fg} style={{ fontFamily: socialFont.bold }}>
        {label}
      </AppText>
    </View>
  );
}

/** Soft pill action (♥ 3 · 💬 1 · share · ⋯) — Nextdoor-style, 44pt tall. */
export function ActionPill({ icon, label, active, onPress, accessibilityLabel, testID, style, compact }: { icon: any; label?: string | number; active?: boolean; onPress?: () => void; accessibilityLabel: string; testID?: string; style?: ViewStyle; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.92} style={[styles.pill, compact && styles.pillCompact, { backgroundColor: active ? colors.brandSoft : colors.surfaceAlt }, style]} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: !!active }} testID={testID}>
      <Ionicons name={icon} size={19} color={active ? colors.brand : colors.text} />
      {label !== undefined && label !== "" && label !== 0 ? (
        <AppText variant="caption" color={active ? colors.brand : colors.text} tabular style={{ fontFamily: socialFont.semibold }}>
          {label}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

/** Filter chip — white bordered pill; selected = ink with white text. */
export function SocialChip({ label, icon, selected, onPress, testID, style, count }: { label: string; icon?: string; selected?: boolean; onPress?: () => void; testID?: string; style?: ViewStyle; count?: number }) {
  const { colors, shadows, isDark } = useTheme();
  return (
    <PressableScale onPress={() => onPress?.()} accessibilityRole="button" accessibilityState={{ selected: !!selected }} testID={testID} style={[styles.chip, { backgroundColor: selected ? colors.surfaceInverse : colors.surface, borderColor: selected ? colors.surfaceInverse : colors.border }, !selected && !isDark && shadows.xs, style]}>
      {icon ? <Ionicons name={icon as any} size={15} color={selected ? colors.textInverse : colors.brand} /> : null}
      <AppText variant="caption" color={selected ? colors.textInverse : colors.text} style={{ fontFamily: socialFont.semibold }}>
        {label}
      </AppText>
      {typeof count === "number" && count > 0 ? (
        <AppText variant="micro" color={selected ? colors.textInverse : colors.textTertiary} tabular>
          {count}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

/** Bold section title (22/800) with optional red action link. */
export function SocialHeading({ title, subtitle, actionLabel, onAction, actionTestID, style, size = "lg" }: { title: string; subtitle?: string | null; actionLabel?: string; onAction?: () => void; actionTestID?: string; style?: ViewStyle; size?: "lg" | "md" }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.heading, style]}>
      <View style={{ flex: 1 }}>
        <AppText style={size === "lg" ? styles.headingLg : styles.headingMd} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySm" tone="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 }} accessibilityRole="button" accessibilityLabel={`${actionLabel} ${title}`} testID={actionTestID}>
          <AppText variant="caption" color={colors.brand} style={{ fontFamily: socialFont.bold }}>
            {actionLabel}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 1 / 2 / 3+ photo collage for the feed card; tapping opens the post. Placeholder tile when no photos. */
export function PostPhotos({ photos, categoryIcon, onPress, height = 260, radius = radii.lg, testID, style }: { photos: string[]; categoryIcon?: string; onPress?: () => void; height?: number; radius?: number; testID?: string; style?: ViewStyle }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const h = Math.min(height, Math.round(Math.min(width, 700) * 0.72));
  const srcs = photos.map(photoUrl).filter(Boolean) as string[];
  const inner = !srcs.length ? (
    <View style={[styles.photoWrap, { height: Math.round(h * 0.6), borderRadius: radius, backgroundColor: colors.brandSoft }]}>
      <Ionicons name={(categoryIcon || "cube") as any} size={44} color={colors.brand} />
      <AppText variant="micro" color={colors.brand} style={{ fontFamily: socialFont.semibold, marginTop: 6 }}>
        No photo yet
      </AppText>
    </View>
  ) : srcs.length === 1 ? (
    <View style={[styles.photoWrap, { height: h, borderRadius: radius, backgroundColor: colors.surfaceAlt }]}>
      <Image source={{ uri: srcs[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
    </View>
  ) : (
    <View style={[styles.photoWrap, { height: h, borderRadius: radius, flexDirection: "row", gap: 3, backgroundColor: colors.surfaceAlt }]}>
      <Image source={{ uri: srcs[0] }} style={{ flex: 1.3, height: "100%" }} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
      <View style={{ flex: 1, gap: 3 }}>
        <Image source={{ uri: srcs[1] }} style={{ flex: 1 }} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        {srcs[2] ? (
          <View style={{ flex: 1 }}>
            <Image source={{ uri: srcs[2] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
            {srcs.length > 3 ? (
              <View style={[StyleSheet.absoluteFill, styles.more]}>
                <AppText variant="h3" color="#FFFFFF">
                  +{srcs.length - 3}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
  if (!onPress) return <View style={style}>{inner}</View>;
  return (
    <Pressable onPress={onPress} style={style} accessibilityRole="imagebutton" accessibilityLabel={`Open post photos (${srcs.length})`} testID={testID}>
      {inner}
    </Pressable>
  );
}

/** Scope picker — Estate · Area · City with radio rows. */
export function ScopeSheet({ visible, onClose, value, onChange, scopes }: { visible: boolean; onClose: () => void; value: SocialScope; onChange: (s: SocialScope) => void; scopes: { estates: { id: string; name: string; area?: string | null }[]; areas: string[]; city: string } }) {
  const { colors } = useTheme();
  const rows: { key: SocialScope; label: string; caption: string; icon: any; disabled?: boolean }[] = [
    { key: "estate", label: scopes.estates[0]?.name ?? "Your estate", caption: scopes.estates.length ? "Only neighbours in your estate" : "Join your estate in Neighbours to unlock", icon: "home", disabled: !scopes.estates.length },
    { key: "area", label: scopes.areas[0] ?? "Your area", caption: scopes.areas.length ? "Your estate and the streets around it" : "Set by your estate — join one in Neighbours", icon: "navigate", disabled: !scopes.areas.length },
    { key: "city", label: scopes.city, caption: "Everyone in the city", icon: "business" },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="Show posts from" testID="social-scope-sheet">
      <View style={{ gap: 8 }}>
        {rows.map((r) => {
          const active = value === r.key;
          return (
            <Pressable key={r.key} disabled={r.disabled} onPress={() => { onChange(r.key); onClose(); }} style={[styles.scopeRow, { backgroundColor: active ? colors.brandSoft : colors.surfaceAlt, opacity: r.disabled ? 0.55 : 1 }]} accessibilityRole="radio" accessibilityState={{ selected: active, disabled: r.disabled }} testID={`social-scope-${r.key}`}>
              <View style={[styles.scopeIcon, { backgroundColor: active ? colors.brand : colors.surface }]}>
                <Ionicons name={r.icon} size={18} color={active ? "#FFFFFF" : colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={{ fontFamily: socialFont.bold, fontSize: 17, lineHeight: 22 }} numberOfLines={1}>
                  {r.label}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={2}>
                  {r.caption}
                </AppText>
              </View>
              <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={22} color={active ? colors.brand : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const REPORT_REASONS: { key: string; label: string }[] = [
  { key: "scam", label: "Looks like a scam" },
  { key: "prohibited", label: "Prohibited or unsafe item" },
  { key: "spam", label: "Spam or repeated post" },
  { key: "offensive", label: "Offensive content" },
  { key: "wrong_info", label: "Misleading details" },
  { key: "other", label: "Something else" },
];

export function ReportSheet({ visible, onClose, onSubmit, busy }: { visible: boolean; onClose: () => void; onSubmit: (reason: string, details: string) => void; busy?: boolean }) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  return (
    <Sheet visible={visible} onClose={onClose} title="Report this post" testID="social-report-sheet">
      <AppText variant="bodySm" tone="secondary" style={{ marginBottom: 10 }}>
        Reports are private. The post is hidden for you right away and our team reviews it.
      </AppText>
      <View style={{ gap: 6 }}>
        {REPORT_REASONS.map((r) => (
          <Pressable key={r.key} onPress={() => setReason(r.key)} style={[styles.reasonRow, { backgroundColor: reason === r.key ? colors.brandSoft : colors.surfaceAlt }]} accessibilityRole="radio" accessibilityState={{ selected: reason === r.key }} testID={`social-report-${r.key}`}>
            <Ionicons name={reason === r.key ? "radio-button-on" : "radio-button-off"} size={18} color={reason === r.key ? colors.brand : colors.textMuted} />
            <AppText variant="bodySm" style={{ flex: 1 }}>
              {r.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Input value={details} onChangeText={setDetails} placeholder="Anything we should know? (optional)" multiline containerStyle={{ marginTop: 12 }} testID="social-report-details" />
      <Button label="Send report" variant="primary" size="lg" fullWidth disabled={!reason} loading={busy} onPress={() => reason && onSubmit(reason, details)} testID="social-report-submit" />
      <SheetLink label="cancel" onPress={onClose} testID="social-report-cancel" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  freeTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 26, borderRadius: 8, alignSelf: "flex-start" },
  freeTagSm: { paddingHorizontal: 7, height: 20, borderRadius: 6 },
  price: { fontFamily: socialFont.black, fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
  priceSm: { fontFamily: socialFont.bold, fontSize: 16, lineHeight: 21 },
  priceLg: { fontFamily: socialFont.black, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 },
  statusTag: { paddingHorizontal: 9, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, minWidth: 48, paddingHorizontal: 14, borderRadius: radii.pill },
  pillCompact: { height: 38, paddingHorizontal: 12, minWidth: 42 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1 },
  heading: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  headingLg: { fontFamily: socialFont.black, fontSize: 24, lineHeight: 29, letterSpacing: -0.5 },
  headingMd: { fontFamily: socialFont.bold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  photoWrap: { width: "100%", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  more: { backgroundColor: "rgba(17,17,17,0.45)", alignItems: "center", justifyContent: "center" },
  scopeRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg },
  scopeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
});
