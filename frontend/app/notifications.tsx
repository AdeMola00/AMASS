import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import Animated from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, type AppNotification, type NotifCategoryMeta } from "@/src/lib/api";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { pushSupported } from "@/src/lib/push";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, BrandGradient, Button, Chip, EmptyState, IconButton, Screen, ScreenHeader, SkeletonRows, useBounceRefresh, useToast, type IconName } from "@/src/ui";

type Tone = "default" | "brand" | "mass" | "fix" | "success" | "warning" | "info" | "premium";

/** Visual treatment per category (icon falls back to the backend catalog). */
const CATEGORY_TONE: Record<string, Tone> = {
  messages: "brand",
  property_matches: "brand",
  nearby_listings: "info",
  brand_offers: "mass",
  marketplace: "mass",
  social: "info",
  nearby_free: "fix",
  passport: "warning",
  receipts: "success",
  admin: "premium",
  services: "fix",
};

/** Kind-level overrides so important states read at a glance. */
const KIND_ICON: Record<string, { icon: IconName; tone?: Tone }> = {
  NEW_MESSAGE: { icon: "chatbubble" },
  SAVED_SEARCH_MATCH: { icon: "search" },
  NEARBY_LISTINGS: { icon: "location" },
  BRAND_OFFER: { icon: "pricetag" },
  MARKET_AD: { icon: "storefront" },
  MARKET_OFFER: { icon: "pricetag" },
  MARKET_MODERATION: { icon: "flag", tone: "warning" },
  PASSPORT_EXPIRY: { icon: "time", tone: "warning" },
  UNLOCK_RECEIPT: { icon: "receipt" },
  TOPUP_RECEIPT: { icon: "wallet" },
  subscription_activated: { icon: "star" },
  VERIFICATION_WIN: { icon: "shield-checkmark", tone: "success" },
  FRAUD_FLAG_RAISED: { icon: "warning", tone: "warning" },
  REPRESENTATION_DECISION: { icon: "document-text" },
  verification_result: { icon: "shield-checkmark" },
  account_status: { icon: "person-circle" },
  badge_update: { icon: "ribbon" },
  review_moderation: { icon: "star-half" },
  review_received: { icon: "star" },
  ESTATE_REQUEST: { icon: "person-add", tone: "warning" },
  ESTATE_APPROVED: { icon: "shield-checkmark", tone: "success" },
  ESTATE_REJECTED: { icon: "close-circle", tone: "warning" },
  ESTATE_NOTICE: { icon: "megaphone" },
  CONNECTION_REQUEST: { icon: "people" },
  CONNECTION_ACCEPTED: { icon: "people", tone: "success" },
  COLLECTION_INVITE: { icon: "albums" },
  COLLECTION_ACTIVITY: { icon: "albums" },
  EVENT_REMINDER: { icon: "calendar" },
  EVENT_CANCELLED: { icon: "calendar", tone: "warning" },
  POST_REPLY: { icon: "chatbubble-ellipses" },
  SOCIAL_POST_LIKE: { icon: "heart" },
  SOCIAL_POST_COMMENT: { icon: "chatbubble-ellipses" },
  SOCIAL_NEARBY_FREE: { icon: "gift", tone: "fix" },
  QUESTION_ANSWERED: { icon: "chatbubble-ellipses" },
  ANSWER_ACCEPTED: { icon: "checkmark-circle", tone: "success" },
  SERVICE_REQUEST: { icon: "construct" },
  SERVICE_REQUEST_UPDATE: { icon: "construct", tone: "success" },
  inspection_requested: { icon: "clipboard" },
  inspection_scheduled: { icon: "calendar" },
  report_ready: { icon: "checkmark-circle", tone: "success" },
  loan_submitted: { icon: "document-text" },
  loan_status_change: { icon: "cash" },
  project_created: { icon: "construct" },
  milestone_completed: { icon: "flag", tone: "success" },
  project_completed: { icon: "trophy", tone: "success" },
  agent_referral_created: { icon: "people" },
  VERIFICATION_TASK_ASSIGNED: { icon: "clipboard" },
  CANDIDATE_PROMOTED: { icon: "home", tone: "success" },
};

/** Short chip labels — the catalog captions are too long for a rail. */
const CHIP_LABEL: Record<string, string> = {
  all: "All",
  messages: "Messages",
  property_matches: "Matches",
  nearby_listings: "Near you",
  brand_offers: "Brands",
  marketplace: "Marketplace",
  social: "Social",
  nearby_free: "Free nearby",
  passport: "Passport",
  receipts: "Receipts",
  admin: "Admin",
  services: "Services",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Where a notification lands — backend `action_url` first, then meta fallbacks for legacy rows. */
export function routeFor(n: AppNotification): string | null {
  if (n.action_url) return n.action_url;
  const meta = n.meta || {};
  if (n.kind === "MARKET_OFFER" && meta.offer_id) return `/marketplace/my-listings?tab=${meta.tab === "sent" ? "sent" : "received"}`;
  if (n.kind === "MARKET_MODERATION") return "/marketplace/my-listings";
  if (n.kind === "ESTATE_REQUEST" && meta.estate_id) return `/neighbours/estates/${meta.estate_id}?tab=people`;
  if (meta.service_request_id) return `/neighbours/services/${meta.service_request_id}`;
  if (meta.post_id) return `/neighbours/posts/${meta.post_id}`;
  if (meta.event_id) return `/neighbours/events/${meta.event_id}`;
  if (meta.collection_id) return `/neighbours/collections/${meta.collection_id}`;
  if (meta.connection_id) return "/neighbours/friends";
  if (meta.estate_id) return `/neighbours/estates/${meta.estate_id}`;
  if (meta.conversation_id) return `/chat/${meta.conversation_id}`;
  if (meta.item_id) return `/marketplace/${meta.item_id}`;
  if (meta.inspection_id) return `/improve/inspection/${meta.inspection_id}`;
  if (meta.application_id) return `/improve/finance/${meta.application_id}`;
  if (meta.project_id) return `/improve/project/${meta.project_id}`;
  if (meta.task_id) return `/agent/tasks/${meta.task_id}`;
  if (meta.amass_property_id) return `/property-passport/${meta.amass_property_id}`;
  if (meta.property_id) return `/property/${meta.property_id}`;
  if (meta.saved_search_id && !meta.preview) return "/saved-searches";
  if (meta.retailer_slug) return `/shop/store/${meta.retailer_slug}`;
  if (meta.reference) return "/wallet";
  if (n.kind === "verification_result" || n.kind === "account_status") return "/become-agent";
  if (n.kind === "badge_update" || n.kind === "review_received") return "/agent-score";
  if (n.kind === "subscription_activated") return "/agent-plans";
  return null;
}

export default function Notifications() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { requestContextualPush } = usePushPrompt();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [byCat, setByCat] = useState<Record<string, number>>({});
  const [catalog, setCatalog] = useState<Record<string, NotifCategoryMeta>>({});
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<string>(typeof params.category === "string" && params.category ? params.category : "all");
  const [pushState, setPushState] = useState<"hidden" | "offer">("hidden");

  const load = useCallback(
    async (cat = category) => {
      setError(false);
      try {
        const r = await api.notifCenter({ category: cat, limit: 40 });
        setItems(r.items);
        setUnread(r.unread);
        setByCat(r.unread_by_category);
        setCatalog(r.categories);
        setNextBefore(r.next_before);
      } catch {
        setError(true);
      }
    },
    [category]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load(category);
      setLoading(false);
    })();
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offer phone alerts only here — the user is already engaging with notifications.
  useEffect(() => {
    if (!pushSupported) return;
    api
      .notifPrefs()
      .then((p) => setPushState(p.push_prompt.status === "granted" || p.push_prompt.status === "blocked" ? "hidden" : "offer"))
      .catch(() => {});
  }, []);

  const { refreshControl, bounceStyle } = useBounceRefresh(() => load(category));

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.notifCenter({ category, before: nextBefore, limit: 40 });
      setItems((prev) => [...prev, ...r.items]);
      setNextBefore(r.next_before);
    } catch {
      toast.error("Couldn't load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const markAllRead = async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const r = await api.markNotifReadAll(category);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(r.unread);
      setByCat((prev) => (category === "all" ? {} : { ...prev, [category]: 0 }));
      toast.success("All caught up", category === "all" ? "Every notification is marked as read." : `${CHIP_LABEL[category] ?? category} alerts marked as read.`);
    } catch {
      toast.error("Couldn't mark as read", "Please try again.");
    }
  };

  const openNotif = (n: AppNotification) => {
    Haptics.selectionAsync().catch(() => {});
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      setByCat((prev) => ({ ...prev, [n.category]: Math.max(0, (prev[n.category] ?? 1) - 1) }));
      api.markNotifRead(n.id).catch(() => {});
    }
    const route = routeFor(n);
    if (route) router.push(route as any);
  };

  const chips = useMemo(() => ["all", ...Object.keys(catalog)], [catalog]);
  const visibleUnread = category === "all" ? unread : byCat[category] ?? 0;

  const sections = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const n of items) {
      const k = dayLabel(n.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return Array.from(map.entries());
  }, [items]);

  const toneMap: Record<Tone, { bg: string; fg: string }> = {
    default: { bg: colors.surfaceAlt, fg: colors.text },
    brand: { bg: colors.brandSoft, fg: colors.brand },
    mass: { bg: colors.massSoft, fg: colors.massText },
    fix: { bg: colors.fixSoft, fg: colors.fixText },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    info: { bg: colors.infoSoft, fg: colors.info },
    premium: { bg: colors.premiumSoft, fg: colors.premium },
  };

  return (
    <Screen testID="notifications-screen">
      <ScreenHeader
        title="Notifications"
        subtitle={visibleUnread > 0 ? `${visibleUnread} unread` : "You're all caught up"}
        right={
          <>
            <IconButton icon="checkmark-done" label="Mark all as read" onPress={markAllRead} disabled={visibleUnread === 0} testID="notif-mark-all" />
            <IconButton icon="options-outline" label="Notification preferences" onPress={() => router.push("/notification-preferences" as any)} testID="notif-prefs" />
          </>
        }
      />

      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map((c) => (
            <Chip
              key={c}
              label={CHIP_LABEL[c] ?? catalog[c]?.label ?? c}
              icon={c === "all" ? "layers-outline" : (`${catalog[c]?.icon ?? "notifications"}-outline` as IconName)}
              selected={category === c}
              onPress={() => setCategory(c)}
              count={(c === "all" ? unread : byCat[c]) || undefined}
              testID={`notif-group-${c}`}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={6} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load notifications" body="Check your connection and try again." actionLabel="Retry" onAction={() => load(category)} />
      ) : (
        <Animated.ScrollView style={bounceStyle} contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 48 }} refreshControl={refreshControl} testID="notif-list">
          {pushState === "offer" ? (
            <Pressable
              onPress={async () => {
                const r = await requestContextualPush("notification_center", { force: true });
                if (r === "granted" || r === "blocked") setPushState("hidden");
              }}
              accessibilityRole="button"
              testID="notif-push-offer"
              style={({ pressed }) => [pressed && { opacity: 0.92 }]}
            >
              <BrandGradient style={[styles.pushCard, shadows.brand]}>
                <View style={styles.pushBell}>
                  <Ionicons name="notifications" size={22} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyMedium" color="#FFFFFF">
                    Get phone alerts for what matters
                  </AppText>
                  <AppText variant="caption" color="rgba(255,255,255,0.85)">
                    Pick categories, set quiet hours. Only what you choose.
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
              </BrandGradient>
            </Pressable>
          ) : null}

          {items.length === 0 ? (
            <EmptyState
              icon="notifications-off-outline"
              title={category === "all" ? "No notifications yet" : `No ${(CHIP_LABEL[category] ?? category).toLowerCase()} alerts`}
              body={category === "all" ? "Matches, messages, receipts, social requests and admin decisions will land here." : catalog[category]?.caption ?? "Nothing here yet."}
              actionLabel={category !== "all" ? "Show all" : undefined}
              onAction={category !== "all" ? () => setCategory("all") : undefined}
              testID="notif-empty"
            />
          ) : null}

          {sections.map(([day, list]) => (
            <View key={day} style={{ gap: 8 }}>
              <AppText variant="label" tone="tertiary" uppercase style={{ marginLeft: 4 }}>
                {day}
              </AppText>
              <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs]}>
                {list.map((n, i) => {
                  const kind = KIND_ICON[n.kind];
                  const icon = (kind?.icon ?? (catalog[n.category]?.icon as IconName) ?? "notifications") as IconName;
                  const tone = toneMap[kind?.tone ?? CATEGORY_TONE[n.category] ?? "default"];
                  const route = routeFor(n);
                  const digest = !!n.meta?.digest;
                  const count = Number(n.meta?.count ?? 0);
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => openNotif(n)}
                      accessibilityRole="button"
                      accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}. ${n.body}`}
                      testID={`notif-${n.id}`}
                      style={({ pressed }) => [
                        styles.row,
                        i < list.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                        !n.read && { backgroundColor: colors.brandSoft },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                        <Ionicons name={icon} size={18} color={tone.fg} />
                        {!n.read ? <View style={[styles.dot, { backgroundColor: colors.brand, borderColor: n.read ? colors.surface : colors.brandSoft }]} /> : null}
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={styles.rowTop}>
                          <AppText variant={n.read ? "bodyMedium" : "title"} numberOfLines={1} style={{ flex: 1 }}>
                            {n.title}
                          </AppText>
                          <AppText variant="caption" tone="tertiary" tabular>
                            {timeAgo(n.created_at)}
                          </AppText>
                        </View>
                        {n.body ? (
                          <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                            {n.body}
                          </AppText>
                        ) : null}
                        <View style={styles.metaRow}>
                          {digest ? <Badge label={n.meta?.frequency === "weekly" ? "Weekly digest" : "Daily digest"} tone="neutral" size="xs" /> : null}
                          {!digest && count > 1 ? <Badge label={`${count} updates`} tone="neutral" size="xs" /> : null}
                          {route ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                              <AppText variant="caption" weight="bold" color={tone.fg}>
                                Open
                              </AppText>
                              <Ionicons name="arrow-forward" size={12} color={tone.fg} />
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {nextBefore ? <Button label="Load older" variant="secondary" size="sm" loading={loadingMore} onPress={loadMore} style={{ alignSelf: "center" }} testID="notif-load-more" /> : null}
          {Platform.OS === "web" && items.length > 0 ? (
            <AppText variant="caption" tone="muted" align="center">
              Phone alerts are available in the AMASS app on iPhone and Android.
            </AppText>
          ) : null}
        </Animated.ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { height: 52 },
  chips: { paddingHorizontal: space[4], gap: 8, alignItems: "center" },
  group: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  pushCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: space[4], borderRadius: radii.lg, overflow: "hidden" },
  pushBell: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
});
