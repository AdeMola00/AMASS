/**
 * AMASS HOME PROTECT building blocks: plan card, cover hero, claim row, selectable item row, peril chips.
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Badge, PressableScale, Toggle, type IconName } from "@/src/ui";
import type { FileRef, ItemCategory } from "@/src/lib/homeHub";
import { CLAIM_ICON, CLAIM_TONE, type Claim, type Plan, type Policy } from "@/src/lib/homeProtect";
import { FileThumb, fmtDate, naira, nairaShort } from "./HomeBits";
import { SECTION_ART, categoryArt } from "./homeArt";

export const massFmt = (n?: number | null) => `${Math.max(0, Math.round(n ?? 0)).toLocaleString()} MASS`;
export const PLAN_ICON: Record<string, IconName> = { basic: "shield-outline", standard: "shield-half", premium: "shield-checkmark" };
export const PERIL_ICON: Record<string, IconName> = { fire: "flame", flood: "water", storm: "thunderstorm", theft: "lock-open", surge: "flash", accident: "alert-circle", breakdown: "construct" };

/* ─── Labelled toggle row (the switch alone says nothing) ────────────────── */
export function ToggleRow({ label, sub, value, onChange, disabled, testID }: { label: string; sub?: string | null; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable onPress={() => !disabled && onChange(!value)} disabled={disabled} accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} accessibilityLabel={label} style={styles.toggleRow} testID={testID ? `${testID}-row` : undefined}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyMedium">{label}</AppText>
        {sub ? (
          <AppText variant="caption" tone="tertiary">
            {sub}
          </AppText>
        ) : null}
      </View>
      <Toggle value={value} onChange={onChange} label={label} disabled={disabled} testID={testID} />
    </Pressable>
  );
}

/* ─── Plan card ─────────────────────────────────────────────────────────── */
export function PlanCard({ plan, priceMass, perYear = true, selected, onPress, perils, compact, testID }: { plan: Plan; priceMass: number; perYear?: boolean; selected?: boolean; onPress?: () => void; perils: Record<string, string>; compact?: boolean; testID?: string }) {
  const { colors, shadows } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "radio" : undefined} accessibilityState={onPress ? { selected: !!selected } : undefined} accessibilityLabel={`${plan.name} plan, ${massFmt(priceMass)} a year. ${plan.tagline ?? ""}`} style={[styles.plan, shadows.xs, { backgroundColor: selected ? colors.brandSoft : colors.surface, borderColor: selected ? colors.brand : colors.border }]} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={[styles.planIcon, { backgroundColor: selected ? colors.brand : colors.surfaceAlt }]}>
          <Ionicons name={PLAN_ICON[plan.key] ?? "shield"} size={20} color={selected ? "#FFFFFF" : colors.textSecondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <AppText variant="title" style={{ fontSize: 17 }}>
              {plan.name}
            </AppText>
            {plan.recommended ? <Badge label="Popular" tone="mass" size="xs" /> : null}
          </View>
          {plan.tagline ? (
            <AppText variant="caption" tone="secondary" numberOfLines={2}>
              {plan.tagline}
            </AppText>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <AppText variant="bodyMedium" weight="bold" tabular>
            {massFmt(priceMass)}
          </AppText>
          <AppText variant="micro" tone="tertiary">
            {perYear ? "per year" : ""}
          </AppText>
        </View>
      </View>
      {!compact ? (
        <>
          <View style={styles.planFacts}>
            <PlanFact label="Building" value={plan.building_limit_ngn ? `up to ${nairaShort(plan.building_limit_ngn)}` : "—"} />
            <PlanFact label="Contents" value={`up to ${nairaShort(plan.contents_limit_ngn)}`} />
            <PlanFact label="Excess" value={naira(plan.excess_ngn) || "₦0"} />
            {plan.appliance_discount_pct ? <PlanFact label="Appliances" value={`${plan.appliance_discount_pct}% off`} /> : null}
          </View>
          <PerilChips keys={plan.perils} perils={perils} />
        </>
      ) : null}
    </Pressable>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: "45%", flexGrow: 1 }}>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
      <AppText variant="caption">{value}</AppText>
    </View>
  );
}

export function PerilChips({ keys, perils, all }: { keys: string[]; perils: Record<string, string>; all?: boolean }) {
  const { colors } = useTheme();
  const list = all ? Object.keys(perils) : keys;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {list.map((k) => {
        const on = keys.includes(k);
        return (
          <View key={k} style={[styles.peril, { backgroundColor: on ? colors.successSoft : colors.surfaceAlt, opacity: on ? 1 : 0.6 }]}>
            <Ionicons name={on ? (PERIL_ICON[k] ?? "checkmark") : "close"} size={12} color={on ? colors.success : colors.textTertiary} />
            <AppText variant="micro" color={on ? colors.success : colors.textTertiary}>
              {perils[k] ?? k}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/* ─── Policy hero ───────────────────────────────────────────────────────── */
export function PolicyHero({ policy, onPress, testID }: { policy: Policy; onPress?: () => void; testID?: string }) {
  const { shadows } = useTheme();
  const expiring = policy.state === "expiring";
  const ended = policy.state === "expired" || policy.state === "cancelled";
  const tint = ended ? "rgba(60,60,60,0.9)" : expiring ? "rgba(180,90,0,0.9)" : "rgba(27,120,70,0.92)";
  return (
    <PressableScale onPress={onPress ?? (() => {})} scaleTo={onPress ? 0.985 : 1} accessibilityRole="button" accessibilityLabel={`${policy.plan_name} cover, ${policy.policy_no}, ${ended ? "ended" : `until ${policy.expires_at}`}`} style={[styles.hero, shadows.md]} testID={testID}>
      <Image source={SECTION_ART.protect} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
      <LinearGradient colors={[tint, tint.replace("0.9", "0.55").replace("0.92", "0.55"), "rgba(0,0,0,0.75)"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={styles.heroPill}>
          <Ionicons name={ended ? "shield-outline" : expiring ? "shield-half" : "shield-checkmark"} size={13} color="#FFFFFF" />
          <AppText variant="micro" color="#FFFFFF" uppercase style={{ letterSpacing: 0.8 }}>
            {ended ? "Cover ended" : expiring ? `Protected · ${policy.days_left}d left` : "Protected"}
          </AppText>
        </View>
        <AppText variant="micro" color="rgba(255,255,255,0.85)" tabular>
          {policy.policy_no}
        </AppText>
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="h2" color="#FFFFFF">
          {policy.plan_name} cover
        </AppText>
        <AppText variant="bodySm" color="rgba(255,255,255,0.92)" numberOfLines={1}>
          {policy.home_name ?? "My home"} · {policy.partner_name}
        </AppText>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          <HeroChip icon="cube" text={`${policy.insured_items} appliance${policy.insured_items === 1 ? "" : "s"}`} />
          {policy.cover?.include_building ? <HeroChip icon="home" text="Building" /> : null}
          <HeroChip icon="bed" text="Contents" />
          <HeroChip icon="calendar" text={ended ? `Ended ${fmtDate(policy.expires_at, true)}` : `Until ${fmtDate(policy.expires_at, true)}`} />
        </View>
      </View>
    </PressableScale>
  );
}

function HeroChip({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.heroChip}>
      <Ionicons name={icon} size={11} color="#FFFFFF" />
      <AppText variant="micro" color="#FFFFFF">
        {text}
      </AppText>
    </View>
  );
}

/* ─── Claim row ─────────────────────────────────────────────────────────── */
export function ClaimRow({ claim, onPress, last, showUser, testID }: { claim: Claim; onPress: () => void; last?: boolean; showUser?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const tone = CLAIM_TONE[claim.status];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Claim ${claim.claim_no}, ${claim.status_label}`} style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} testID={testID}>
      <View style={styles.thumb}>
        {claim.item_photo ? <FileThumb file={claim.item_photo} size={46} radius={radii.md} /> : <Image source={claim.scope === "appliance" ? categoryArt(null) : SECTION_ART.protect} style={{ width: 46, height: 46, borderRadius: radii.md }} contentFit="cover" accessibilityIgnoresInvertColors />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {claim.item_name ?? (claim.scope === "building" ? "The building" : "Household items")} · {claim.incident_label}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1}>
          {claim.claim_no} · {fmtDate(claim.incident_date, true)}
          {showUser && claim.user?.name ? ` · ${claim.user.name}` : ""}
          {claim.payout_ngn ? ` · ${naira(claim.payout_ngn)}` : claim.amount_claimed_ngn ? ` · ${naira(claim.amount_claimed_ngn)} claimed` : ""}
        </AppText>
        <Badge label={claim.status_label} tone={tone} icon={CLAIM_ICON[claim.status] as IconName} size="xs" />
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/* ─── Selectable item (quote) ───────────────────────────────────────────── */
export function ItemPickRow({ name, category, value, photo, selected, disabled, note, premium, onPress, last, testID }: { name: string; category: ItemCategory; value?: number | null; photo?: FileRef | null; selected: boolean; disabled?: boolean; note?: string | null; premium?: number | null; onPress: () => void; last?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} accessibilityLabel={`${name}${value ? `, worth ${naira(value)}` : ""}`} style={[styles.row, { opacity: disabled ? 0.55 : 1 }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} testID={testID}>
      {photo ? <FileThumb file={photo} size={46} radius={radii.md} /> : <Image source={categoryArt(category)} style={{ width: 46, height: 46, borderRadius: radii.md }} contentFit="cover" accessibilityIgnoresInvertColors />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="caption" tone={note ? "warning" : "secondary"} numberOfLines={1}>
          {note ?? (value ? `Worth ${naira(value)}${premium ? ` · ${naira(premium)}/yr` : ""}` : "No value yet")}
        </AppText>
      </View>
      <Ionicons name={selected ? "checkbox" : "square-outline"} size={24} color={selected ? colors.brand : colors.textMuted} />
    </Pressable>
  );
}

/* ─── Claim timeline (newest first) ─────────────────────────────────────── */
export function ClaimTimeline({ claim, admin }: { claim: Claim; admin?: boolean }) {
  const { colors } = useTheme();
  return (
    <View testID="claim-timeline">
      {[...claim.timeline].reverse().map((t, i, arr) => {
        const tone = CLAIM_TONE[t.status];
        const col = tone === "success" || tone === "mass" ? colors.success : tone === "warning" ? colors.warning : tone === "error" ? colors.error : tone === "info" ? colors.info : colors.textSecondary;
        return (
          <View key={`${t.at}-${i}`} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", width: 28 }}>
              <View style={[styles.tlDot, { backgroundColor: col }]}>
                <Ionicons name={CLAIM_ICON[t.status] as IconName} size={13} color="#FFFFFF" />
              </View>
              {i < arr.length - 1 ? <View style={[styles.tlLine, { backgroundColor: colors.border }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: i < arr.length - 1 ? 14 : 0 }}>
              <AppText variant="bodyMedium">
                {t.by === "you" ? (admin ? "Customer" : "You") : claim.partner_name || "Insurer"} · {t.status === "submitted" ? "Submitted" : t.status.replace("_", " ")}
              </AppText>
              {t.note ? (
                <AppText variant="caption" tone="secondary">
                  {t.note}
                </AppText>
              ) : null}
              {t.photos?.length ? (
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  {t.photos.map((p, k) => (
                    <FileThumb key={`${p.path}-${k}`} file={p} size={40} radius={radii.sm} />
                  ))}
                </View>
              ) : null}
              <AppText variant="micro" tone="tertiary">
                {dayjs(t.at).format("D MMM YYYY, HH:mm")}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ─── Simple key/value line used on quote + policy screens ─────────────── */
export function Line({ label, value, strong, tone, testID }: { label: string; value: string; strong?: boolean; tone?: "secondary" | "primary"; testID?: string }) {
  return (
    <View style={styles.line} testID={testID}>
      <AppText variant={strong ? "bodyMedium" : "bodySm"} tone={strong ? "primary" : tone ?? "secondary"} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant={strong ? "bodyMedium" : "bodySm"} weight={strong ? "bold" : undefined} tabular>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  plan: { borderRadius: radii.xl, borderWidth: 1.5, padding: 14, gap: 12 },
  planIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  planFacts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  peril: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12 },
  hero: { minHeight: 196, borderRadius: radii.xl, overflow: "hidden", padding: 16, justifyContent: "space-between", backgroundColor: "#1B4D36" },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.35)" },
  heroChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.2)" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 64 },
  thumb: { width: 46, height: 46, borderRadius: radii.md, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  tlDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tlLine: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1 },
});
