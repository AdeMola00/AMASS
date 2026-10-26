/**
 * FIXA shared bits — FIXA is free: every provider shows phone + WhatsApp, booking costs nothing and pros build a
 * reputation (jobs done · rating · badges) instead of earning tokens.
 */
import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import type { FixaBooking, FixaReportReason, FixaStatus, ProviderPreview } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Chip, Input, PressableScale, Sheet, type IconName } from "@/src/ui";
import type { BadgeTone } from "@/src/ui";
import { photoUrl } from "@/src/components/social/socialTheme";

/** One consistent icon per trade, app-wide. */
export const TRADE_ICON: Record<string, IconName> = {
  plumbing: "water",
  plumber: "water",
  electrical: "flash",
  electrician: "flash",
  carpentry: "hammer",
  carpenter: "hammer",
  painting: "color-palette",
  painter: "color-palette",
  tiling: "grid",
  "ac repair": "snow",
  ac: "snow",
  solar: "sunny",
  cctv: "videocam",
  "cctv & security": "videocam",
  security: "videocam",
  cleaning: "sparkles",
  cleaner: "sparkles",
  movers: "cube",
  moving: "cube",
  interior: "bed",
  "interior design": "bed",
  "interior designers": "bed",
  architects: "business",
  architect: "business",
  generator: "flash",
  roofing: "home",
  gardening: "leaf",
  "pest control": "bug",
  pest: "bug",
  welding: "flame",
  "pool maintenance": "water",
  pool: "water",
  laundry: "shirt",
  handyman: "construct",
  renovation: "construct",
  "pop ceiling": "layers",
  engineer: "cog",
  engineers: "cog",
  surveyor: "map",
  surveyors: "map",
  valuer: "calculator",
  "legal / title": "document-text",
  "project managers": "clipboard",
};

export const tradeIcon = (trade?: string | null): IconName => TRADE_ICON[(trade ?? "").toLowerCase()] ?? "construct";

export const BADGE_ICON: Record<string, IconName> = {
  "AMASS Verified": "shield-checkmark",
  Rising: "trending-up",
  "Top Pro": "ribbon",
  Veteran: "medal",
  "Background Checked": "finger-print",
  Insured: "umbrella",
};

const digits = (raw?: string | null) => (raw ?? "").replace(/[^\d+]/g, "");

/** Opens the dialer. Returns false when the pro has no number so the caller can toast. */
export function callProvider(phone?: string | null): boolean {
  const n = digits(phone);
  if (!n) return false;
  Haptics.selectionAsync().catch(() => {});
  Linking.openURL(`tel:${n}`).catch(() => {});
  return true;
}

/** Opens WhatsApp with a friendly opener. Returns false when there's no number. */
export function whatsappProvider(p: { whatsapp?: string | null; phone?: string | null; display_name?: string; category?: string }): boolean {
  const n = digits(p.whatsapp || p.phone).replace(/^\+/, "");
  if (!n) return false;
  Haptics.selectionAsync().catch(() => {});
  const msg = encodeURIComponent(`Hi ${p.display_name ?? ""}, I found you on AMASS FIXA and would like to book a ${(p.category ?? "service").toLowerCase()} job.`);
  Linking.openURL(`https://wa.me/${n}?text=${msg}`).catch(() => Linking.openURL(`whatsapp://send?phone=${n}&text=${msg}`).catch(() => {}));
  return true;
}

export const STATUS_META: Record<FixaStatus | "listed" | "none", { label: string; tone: BadgeTone; icon: IconName }> = {
  none: { label: "Not on FIXA", tone: "neutral", icon: "person-add-outline" },
  pending: { label: "Awaiting verification", tone: "warning", icon: "time-outline" },
  verified: { label: "Verified · live", tone: "success", icon: "shield-checkmark" },
  listed: { label: "Live", tone: "success", icon: "checkmark-circle" },
  rejected: { label: "Not approved", tone: "brand", icon: "close-circle-outline" },
  suspended: { label: "Suspended", tone: "brand", icon: "pause-circle-outline" },
  hidden: { label: "Hidden · under review", tone: "warning", icon: "eye-off-outline" },
};

export const BOOKING_META: Record<FixaBooking["status"], { label: string; tone: BadgeTone; icon: IconName }> = {
  pending: { label: "Waiting for pro", tone: "warning", icon: "time-outline" },
  confirmed: { label: "Confirmed", tone: "success", icon: "checkmark-circle" },
  completed: { label: "Done", tone: "neutral", icon: "checkmark-done" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "close-circle-outline" },
  declined: { label: "Declined", tone: "brand", icon: "remove-circle-outline" },
};

export function formatSlot(b: Pick<FixaBooking, "scheduled_date" | "scheduled_time">) {
  const d = new Date(`${b.scheduled_date}T00:00:00`);
  const day = Number.isNaN(d.getTime()) ? b.scheduled_date : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${b.scheduled_time}`;
}

/** Round contact buttons (call = ink on soft, WhatsApp = brand green). Shared by rows, rails and profiles. */
export function ContactButtons({ provider, size = 40, onMissing, testIDPrefix = "fixa" }: { provider: Pick<ProviderPreview, "id" | "phone" | "whatsapp" | "display_name" | "category">; size?: number; onMissing?: (what: "phone" | "whatsapp") => void; testIDPrefix?: string }) {
  const { colors } = useTheme();
  const r = size / 2;
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Pressable
        onPress={() => {
          if (!callProvider(provider.phone)) onMissing?.("phone");
        }}
        style={[styles.contactBtn, { width: size, height: size, borderRadius: r, backgroundColor: colors.surfaceAlt }]}
        accessibilityRole="button"
        accessibilityLabel={`Call ${provider.display_name}`}
        testID={`${testIDPrefix}-call-${provider.id}`}
      >
        <Ionicons name="call" size={size * 0.42} color={colors.text} />
      </Pressable>
      <Pressable
        onPress={() => {
          if (!whatsappProvider(provider)) onMissing?.("whatsapp");
        }}
        style={[styles.contactBtn, { width: size, height: size, borderRadius: r, backgroundColor: "#25D366" }]}
        accessibilityRole="button"
        accessibilityLabel={`WhatsApp ${provider.display_name}`}
        testID={`${testIDPrefix}-whatsapp-${provider.id}`}
      >
        <Ionicons name="logo-whatsapp" size={size * 0.45} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

export function ProviderAvatar({ provider, size = 56 }: { provider: Pick<ProviderPreview, "image" | "initials" | "verified">; size?: number }) {
  const { colors } = useTheme();
  const dot = Math.max(18, Math.round(size * 0.34));
  return (
    <View style={{ width: size, height: size }}>
      {provider.image ? (
        <Image source={{ uri: photoUrl(provider.image) }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.skeleton }} contentFit="cover" transition={200} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
          <AppText variant={size >= 72 ? "h2" : "title"} color={colors.textInverse}>
            {provider.initials}
          </AppText>
        </View>
      )}
      {provider.verified ? (
        <View style={[styles.verifyDot, { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colors.fix, borderColor: colors.bg }]}>
          <Ionicons name="shield-checkmark" size={dot * 0.55} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

/** Jobs · rating · area line used under a provider's name. */
export function ReputationLine({ provider, compact }: { provider: Pick<ProviderPreview, "rating" | "reviews" | "jobs_completed" | "area">; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {provider.rating ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Ionicons name="star" size={12} color={colors.mass} />
          <AppText variant="caption" weight="bold" tabular>
            {Number(provider.rating).toFixed(1)}
          </AppText>
          <AppText variant="caption" tone="tertiary" tabular>
            ({provider.reviews ?? 0})
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" tone="tertiary">
          New on FIXA
        </AppText>
      )}
      {(provider.jobs_completed ?? 0) > 0 ? (
        <AppText variant="caption" tone="tertiary" tabular>
          · {provider.jobs_completed} jobs
        </AppText>
      ) : null}
      {!compact && provider.area ? (
        <AppText variant="caption" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
          · {provider.area}
        </AppText>
      ) : null}
    </View>
  );
}

export function BadgeStrip({ badges, max = 3, size = "xs" }: { badges: string[]; max?: number; size?: "xs" | "sm" }) {
  if (!badges.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {badges.slice(0, max).map((b) => (
        <Badge key={b} label={b} tone="fix" icon={BADGE_ICON[b] ?? "checkmark-circle"} size={size} />
      ))}
      {badges.length > max ? <Badge label={`+${badges.length - max}`} tone="neutral" size={size} /> : null}
    </View>
  );
}

/** Directory row — tap opens the profile; call / WhatsApp work straight from the list. */
export function ProviderRow({ provider: p, onPress, onMissingContact }: { provider: ProviderPreview; onPress: () => void; onMissingContact?: (what: "phone" | "whatsapp") => void }) {
  const { colors, shadows } = useTheme();
  // Contact buttons are siblings of the card pressable — nested buttons are invalid on web and a call tap must never open the profile.
  return (
    <View style={[styles.row, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]} testID={`fixa-row-${p.id}`}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${p.display_name}, ${p.category}${p.rating ? `, rated ${Number(p.rating).toFixed(1)}` : ""}. Open profile`}
        testID={`fixa-row-open-${p.id}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
      >
        <ProviderAvatar provider={p} size={76} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppText variant="h3" weight="extrabold" numberOfLines={2} style={{ flex: 1 }}>
              {p.display_name}
            </AppText>
            {p.is_boosted ? <Badge label="Boosted" tone="premium" icon="rocket" size="xs" /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Badge label={p.category} tone="neutral" size="xs" icon={tradeIcon(p.category)} />
            {p.years_experience ? (
              <AppText variant="micro" tone="tertiary">
                {p.years_experience} yrs
              </AppText>
            ) : null}
          </View>
          <ReputationLine provider={p} />
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </PressableScale>
      <View style={styles.rowFooter}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <BadgeStrip badges={p.badges} max={2} />
        </View>
        <View style={{ flexShrink: 0 }}>
          <ContactButtons provider={p} size={44} onMissing={onMissingContact} />
        </View>
      </View>
    </View>
  );
}

/** Compact card for horizontal rails (Feeds · "Pros near you"). */
export function ProviderMiniCard({ provider: p, onPress, onMissingContact }: { provider: ProviderPreview; onPress: () => void; onMissingContact?: (what: "phone" | "whatsapp") => void }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.mini, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]} testID={`fixa-mini-${p.id}`}>
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${p.display_name}, ${p.category}. Open profile`} testID={`fixa-mini-open-${p.id}`} style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ProviderAvatar provider={p} size={60} />
          <View style={{ flex: 1 }}>
            <AppText variant="title" weight="extrabold" numberOfLines={1}>
              {p.display_name}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {p.category}
            </AppText>
          </View>
        </View>
        <ReputationLine provider={p} compact />
      </PressableScale>
      <ContactButtons provider={p} size={44} onMissing={onMissingContact} testIDPrefix="fixa-mini" />
    </View>
  );
}

/** Stars + review — used by customers when they mark a job done. */
export function RateSheet({ visible, booking, onClose, onSubmit, busy }: { visible: boolean; booking: FixaBooking | null; onClose: () => void; onSubmit: (rating: number, review: string) => void; busy?: boolean }) {
  const { colors } = useTheme();
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState("");
  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
  return (
    <Sheet visible={visible} onClose={onClose} title="Rate the job" testID="fixa-rate-sheet">
      <View style={{ gap: space[4] }}>
        <AppText variant="body" tone="secondary">
          How did {booking?.provider_name ?? "the pro"} do with your {(booking?.trade ?? "job").toLowerCase()}? Ratings are public and build their FIXA reputation.
        </AppText>
        <View style={{ alignItems: "center", gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setStars(n);
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
                accessibilityState={{ selected: n <= stars }}
                testID={`fixa-star-${n}`}
              >
                <Ionicons name={n <= stars ? "star" : "star-outline"} size={40} color={n <= stars ? colors.mass : colors.borderStrong} />
              </Pressable>
            ))}
          </View>
          <AppText variant="title" testID="fixa-star-label">
            {labels[stars]}
          </AppText>
        </View>
        <Input label="Say a few words (optional)" value={review} onChangeText={setReview} placeholder="Arrived on time, neat work…" multiline maxLength={500} testID="fixa-review-input" />
        <Button label="Mark done & rate" variant="primary" size="lg" iconLeft="checkmark-done" loading={busy} onPress={() => onSubmit(stars, review.trim())} testID="fixa-rate-submit" />
      </View>
    </Sheet>
  );
}

const REASONS: { key: FixaReportReason; label: string; icon: IconName }[] = [
  { key: "no_show", label: "Didn't show up", icon: "time-outline" },
  { key: "poor_work", label: "Poor quality work", icon: "thumbs-down-outline" },
  { key: "overcharging", label: "Overcharged / hidden fees", icon: "cash-outline" },
  { key: "unsafe", label: "Unsafe or unprofessional", icon: "warning-outline" },
  { key: "fraud", label: "Scam or fraud", icon: "alert-circle-outline" },
  { key: "other", label: "Something else", icon: "ellipsis-horizontal-circle-outline" },
];

/** Report a provider — every report reaches AMASS Admin; three from different people hide the profile automatically. */
export function ReportSheet({ visible, providerName, onClose, onSubmit, busy }: { visible: boolean; providerName: string; onClose: () => void; onSubmit: (reason: FixaReportReason, details: string) => void; busy?: boolean }) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<FixaReportReason | null>(null);
  const [details, setDetails] = useState("");
  return (
    <Sheet visible={visible} onClose={onClose} title={`Report ${providerName}`} testID="fixa-report-sheet">
      <View style={{ gap: space[4] }}>
        <AppText variant="body" tone="secondary">
          Tell AMASS Admin what happened. Reports are private; a provider reported by three different people is hidden until an admin reviews them.
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {REASONS.map((r) => (
            <Chip key={r.key} label={r.label} icon={r.icon} selected={reason === r.key} onPress={() => setReason(r.key)} testID={`fixa-report-${r.key}`} />
          ))}
        </View>
        <Input label="Details (optional)" value={details} onChangeText={setDetails} placeholder="What happened, and when?" multiline maxLength={600} testID="fixa-report-details" />
        <Button label="Send report" variant="primary" size="lg" iconLeft="flag" disabled={!reason} loading={busy} onPress={() => reason && onSubmit(reason, details.trim())} testID="fixa-report-submit" />
        <AppText variant="micro" tone="tertiary" align="center">
          False reports can lead to your account being reviewed. <Ionicons name="shield-checkmark-outline" size={11} color={colors.textTertiary} />
        </AppText>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  contactBtn: { alignItems: "center", justifyContent: "center" },
  verifyDot: { position: "absolute", bottom: -2, right: -2, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  row: { padding: space[4], borderRadius: radii.xl, gap: 12, borderWidth: 1.5 },
  rowFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  mini: { width: 240, padding: space[3], borderRadius: radii.xl, gap: 10, borderWidth: 1.5 },
});
