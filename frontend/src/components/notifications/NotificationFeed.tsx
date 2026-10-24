/**
 * Notification feed — the shared body of the Updates tab (Activity) and the /notifications screen.
 * Category chips (+ "Unread" filter, remembered) → day-grouped rows → deep links.
 * Rows swipe: → mark read/unread · ← dismiss, both with Undo. "Clear read" tucks away everything already read.
 * Exposes `markAllRead()` / `reload()` for the host header.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, type AppNotification, type NotifCategoryMeta } from "@/src/lib/api";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { pushSupported } from "@/src/lib/push";
import { storage } from "@/src/utils/storage";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, BrandGradient, Button, Chip, EmptyState, SkeletonRows, useBounceRefresh, useToast, type IconName } from "@/src/ui";
import { SwipeableNotification, swipedRecently } from "./SwipeableNotification";

const UNREAD_ONLY_KEY = "amass_notif_unread_only_v1";

type Tone = "default" | "brand" | "mass" | "fix" | "success" | "warning" | "info" | "premium";

/** Visual treatment per category (icon falls back to the backend catalog). */
const CATEGORY_TONE: Record<string, Tone> = {
  messages: "brand",
  property_matches: "brand",
  nearby_listings: "info",
  brand_offers: "mass",
  marketplace: "mass",
  social: "info",
  nearby_free: "success",
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
  IDENTITY_SUBMITTED: { icon: "card" },
  IDENTITY_VERIFIED: { icon: "shield-checkmark", tone: "success" },
  IDENTITY_REJECTED: { icon: "card", tone: "warning" },
  DOCS_VERIFIED: { icon: "document-text", tone: "success" },
  DOCS_REJECTED: { icon: "document-text", tone: "warning" },
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
  SOCIAL_NEARBY_FREE: { icon: "gift", tone: "success" },
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
export const CHIP_LABEL: Record<string, string> = {
  all: "All",
  messages: "Messages",
  property_matches: "Matches",
  nearby_listings: "Near you",
  brand_offers: "Brands",
  marketplace: "Marketplace",
  social: "Neighbours",
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

export type NotificationFeedHandle = { markAllRead: () => Promise<void>; reload: () => Promise<void> };

export const NotificationFeed = forwardRef<
  NotificationFeedHandle,
  {
    initialCategory?: string;
    /** Extra space under the list (floating tab bar). */
    bottomPadding?: number;
    /** Reports the unread count for the visible category (host header shows it + enables Mark all read). */
    onUnreadChange?: (visible: number, total: number) => void;
    /** Optional node rendered above the list (e.g. shortcuts). */
    header?: React.ReactNode;
    testID?: string;
  }
>(function NotificationFeed({ initialCategory, bottomPadding = 48, onUnreadChange, header, testID = "notif-list" }, ref) {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();
  /** Matches the Updates header cap so chips, list and header share one column on tablets / wide web. */
  const column = { alignSelf: "center" as const, width: Math.min(width, 720) };
  const toast = useToast();
  const { requestContextualPush } = usePushPrompt();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [byCat, setByCat] = useState<Record<string, number>>({});
  const [readCount, setReadCount] = useState(0);
  const [catalog, setCatalog] = useState<Record<string, NotifCategoryMeta>>({});
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<string>(initialCategory || "all");
  const [pushState, setPushState] = useState<"hidden" | "offer">("hidden");
  // "Unread only" is remembered; null = still reading the saved value (avoids a flash of the wrong list).
  const [unreadOnly, setUnreadOnly] = useState<boolean | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const reqId = useRef(0);
  const itemsRef = useRef<AppNotification[]>([]);
  itemsRef.current = items;
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartX = useRef<number | null>(null);
  useEffect(() => () => void (armTimer.current && clearTimeout(armTimer.current)), []);
  /** Handlers always act on the row as it is NOW (a swipe and a tap can race on web). */
  const latest = (n: AppNotification) => itemsRef.current.find((x) => x.id === n.id) ?? n;

  useEffect(() => {
    storage.getItem<boolean>(UNREAD_ONLY_KEY, false).then((v) => setUnreadOnly(!!v));
  }, []);

  const load = useCallback(
    async (cat = category, uo = unreadOnly ?? false) => {
      const id = ++reqId.current;
      setError(false);
      try {
        const r = await api.notifCenter({ category: cat, limit: 40, unreadOnly: uo });
        if (id !== reqId.current) return;
        setItems(r.items);
        setUnread(r.unread);
        setByCat(r.unread_by_category);
        setReadCount(r.read_count ?? 0);
        setCatalog(r.categories);
        setNextBefore(r.next_before);
      } catch {
        if (id === reqId.current) setError(true);
      }
    },
    [category, unreadOnly]
  );

  useEffect(() => {
    if (unreadOnly === null) return;
    (async () => {
      setLoading(true);
      setClearArmed(false);
      await load(category, unreadOnly);
      setLoading(false);
    })();
  }, [category, unreadOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleUnreadOnly = () => {
    const next = !(unreadOnly ?? false);
    Haptics.selectionAsync().catch(() => {});
    setUnreadOnly(next);
    storage.setItem(UNREAD_ONLY_KEY, next);
  };

  // Offer phone alerts only here — the user is already engaging with notifications.
  useEffect(() => {
    if (!pushSupported) return;
    api
      .notifPrefs()
      .then((p) => setPushState(p.push_prompt.status === "granted" || p.push_prompt.status === "blocked" ? "hidden" : "offer"))
      .catch(() => {});
  }, []);

  const visibleUnread = category === "all" ? unread : byCat[category] ?? 0;
  useEffect(() => {
    onUnreadChange?.(visibleUnread, unread);
  }, [visibleUnread, unread, onUnreadChange]);

  const { refreshControl, bounceStyle } = useBounceRefresh(() => load(category));

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.notifCenter({ category, before: nextBefore, limit: 40, unreadOnly: unreadOnly ?? false });
      setItems((prev) => [...prev, ...r.items]);
      setNextBefore(r.next_before);
    } catch {
      toast.error("Couldn't load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const markAllRead = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const r = await api.markNotifReadAll(category);
      setItems((prev) => (unreadOnly ? [] : prev.map((n) => ({ ...n, read: true }))));
      setReadCount((c) => c + r.marked);
      setUnread(r.unread);
      setByCat((prev) => (category === "all" ? {} : { ...prev, [category]: 0 }));
      notifyBadges();
      toast.success("All caught up", category === "all" ? "Every update is marked as read." : `${CHIP_LABEL[category] ?? category} alerts marked as read.`);
    } catch {
      toast.error("Couldn't mark as read", "Please try again.");
    }
  }, [category, toast, unreadOnly]);

  useImperativeHandle(ref, () => ({ markAllRead, reload: () => load(category) }), [markAllRead, load, category]);

  /** Local bookkeeping when one row flips read ↔ unread (keeps header counts honest without a refetch). */
  const bump = (n: AppNotification, nowRead: boolean) => {
    const delta = nowRead ? -1 : 1;
    setUnread((u) => Math.max(0, u + delta));
    setByCat((prev) => ({ ...prev, [n.category]: Math.max(0, (prev[n.category] ?? 0) + delta) }));
    setReadCount((c) => Math.max(0, c - delta));
  };

  const insertBack = (n: AppNotification) =>
    setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [...prev, n].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))));

  const openNotif = (stale: AppNotification, e?: { nativeEvent?: { pageX?: number } }) => {
    // The tap that ends a (web mouse) swipe must not navigate: gesture flag + pointer travel check.
    const moved = pressStartX.current != null && e?.nativeEvent?.pageX != null && Math.abs(e.nativeEvent.pageX - pressStartX.current) > 8;
    pressStartX.current = null;
    if (swipedRecently() || moved) return;
    const n = latest(stale);
    Haptics.selectionAsync().catch(() => {});
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      bump(n, true);
      api.markNotifRead(n.id).then(notifyBadges).catch(() => {});
    }
    const route = routeFor(n);
    if (route) router.push(route as any);
  };

  /** Swipe → : flip read state. In "Unread only" a newly-read row leaves the list (Undo brings it back). */
  const toggleRead = async (stale: AppNotification) => {
    const n = latest(stale);
    const nowRead = !n.read;
    const updated = { ...n, read: nowRead };
    setItems((prev) => (unreadOnly && nowRead ? prev.filter((x) => x.id !== n.id) : prev.map((x) => (x.id === n.id ? updated : x))));
    bump(n, nowRead);
    const revert = () => {
      setItems((prev) => (prev.some((x) => x.id === n.id) ? prev.map((x) => (x.id === n.id ? n : x)) : prev));
      if (unreadOnly && nowRead) insertBack(n);
      bump(updated, !nowRead);
    };
    try {
      await (nowRead ? api.markNotifRead(n.id) : api.markNotifUnread(n.id));
      notifyBadges();
      toast.show({
        kind: "success",
        title: nowRead ? "Marked as read" : "Marked as unread",
        actionLabel: "Undo",
        onAction: async () => {
          revert();
          await (nowRead ? api.markNotifUnread(n.id) : api.markNotifRead(n.id)).then(notifyBadges).catch(() => {});
        },
      });
    } catch (e: any) {
      revert();
      toast.error("Couldn't update", e?.message ?? "Please try again.");
    }
  };

  /** Swipe ← : dismiss (soft) with Undo. */
  const dismiss = async (stale: AppNotification) => {
    const n = latest(stale);
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.read) bump(n, true);
    else setReadCount((c) => Math.max(0, c - 1));
    const revert = () => {
      insertBack(n);
      if (!n.read) bump(n, false);
      else setReadCount((c) => c + 1);
    };
    try {
      await api.dismissNotif(n.id);
      notifyBadges();
      toast.show({
        kind: "info",
        title: "Update dismissed",
        actionLabel: "Undo",
        onAction: async () => {
          revert();
          await api.restoreNotif(n.id).then(notifyBadges).catch(() => {});
        },
      });
    } catch (e: any) {
      revert();
      toast.error("Couldn't dismiss", e?.message ?? "Please try again.");
    }
  };

  /** "Clear read" — two taps (arm → confirm); bulk, so no Undo. */
  const clearRead = async () => {
    if (!clearArmed) {
      Haptics.selectionAsync().catch(() => {});
      setClearArmed(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setClearArmed(false), 4000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setClearing(true);
    try {
      const r = await api.dismissReadNotifs(category);
      setItems((prev) => prev.filter((x) => !x.read));
      setReadCount(0);
      setClearArmed(false);
      toast.success(`Cleared ${r.marked} read update${r.marked === 1 ? "" : "s"}`, "Unread ones are still here.");
    } catch (e: any) {
      toast.error("Couldn't clear", e?.message ?? "Please try again.");
    } finally {
      setClearing(false);
    }
  };

  const chips = useMemo(() => ["all", ...Object.keys(catalog)], [catalog]);

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
    <View style={{ flex: 1 }}>
      <View style={[styles.chipsWrap, column]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Unread" icon={unreadOnly ? "mail-unread" : "mail-unread-outline"} selected={!!unreadOnly} tone="brand" onPress={toggleUnreadOnly} testID="notif-unread-only" />
          <View style={[styles.chipDivider, { backgroundColor: colors.border }]} />
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

      {loading || unreadOnly === null ? (
        <View style={[{ padding: space[4] }, column]}>
          <SkeletonRows rows={6} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load your updates" body="Check your connection and try again." actionLabel="Retry" onAction={() => load(category)} testID="notif-error" />
      ) : (
        <Animated.ScrollView style={bounceStyle} contentContainerStyle={[{ padding: space[4], gap: space[4], paddingBottom: bottomPadding }, column]} refreshControl={refreshControl} showsVerticalScrollIndicator={false} testID={testID}>
          {header}
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
            unreadOnly ? (
              <EmptyState icon="checkmark-done-circle-outline" title="You're all caught up" body={category === "all" ? "No unread updates. Switch off the Unread filter to see everything you've already read." : `No unread ${(CHIP_LABEL[category] ?? category).toLowerCase()} alerts.`} actionLabel="Show read updates" onAction={toggleUnreadOnly} secondaryLabel={category !== "all" ? "Show all categories" : undefined} onSecondary={category !== "all" ? () => setCategory("all") : undefined} testID="notif-empty-unread" />
            ) : (
              <EmptyState
                icon="notifications-off-outline"
                title={category === "all" ? "No updates yet" : `No ${(CHIP_LABEL[category] ?? category).toLowerCase()} alerts`}
                body={category === "all" ? "Price drops, saved-search matches, messages, receipts and document reviews will land here." : catalog[category]?.caption ?? "Nothing here yet."}
                actionLabel={category !== "all" ? "Show all" : undefined}
                onAction={category !== "all" ? () => setCategory("all") : undefined}
                testID="notif-empty"
              />
            )
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
                    <SwipeableNotification key={n.id} read={n.read} onToggleRead={() => toggleRead(n)} onDismiss={() => dismiss(n)} testID={`notif-swipe-${n.id}`}>
                      <Pressable
                        onPressIn={(e) => {
                          pressStartX.current = e.nativeEvent?.pageX ?? null;
                        }}
                        onPress={(e) => openNotif(n, e)}
                        accessibilityRole="button"
                        accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}. ${n.body}`}
                        accessibilityHint="Swipe right to mark read or unread, swipe left to dismiss"
                        testID={`notif-${n.id}`}
                        style={({ pressed }) => [
                          styles.row,
                          { backgroundColor: n.read ? colors.surface : colors.brandSoft },
                          i < list.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                      <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                        <Ionicons name={icon} size={18} color={tone.fg} />
                        {!n.read ? <View style={[styles.dot, { backgroundColor: colors.brand, borderColor: colors.brandSoft }]} /> : null}
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={styles.rowTop}>
                          <AppText variant={n.read ? "bodyMedium" : "title"} numberOfLines={2} style={{ flex: 1 }}>
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
                    </SwipeableNotification>
                  );
                })}
              </View>
            </View>
          ))}

          {nextBefore ? <Button label="Load older" variant="secondary" size="sm" loading={loadingMore} onPress={loadMore} style={{ alignSelf: "center" }} testID="notif-load-more" /> : null}

          {/* Clear read — tucks every read row away (two taps). Hidden in "Unread only" where read rows aren't shown anyway. */}
          {!unreadOnly && readCount > 0 && items.length > 0 ? (
            <Button
              label={clearArmed ? `Tap again to clear ${readCount} read` : `Clear ${readCount} read update${readCount === 1 ? "" : "s"}`}
              variant={clearArmed ? "destructive" : "ghost"}
              size="sm"
              iconLeft={clearArmed ? "trash-outline" : "checkmark-done-outline"}
              loading={clearing}
              onPress={clearRead}
              style={{ alignSelf: "center" }}
              testID="notif-clear-read"
            />
          ) : null}
          {items.length > 0 ? (
            <AppText variant="caption" tone="muted" align="center" testID="notif-swipe-hint">
              Swipe right to mark read or unread · swipe left to dismiss
            </AppText>
          ) : null}
          {Platform.OS === "web" && items.length > 0 ? (
            <AppText variant="caption" tone="muted" align="center">
              Phone alerts are available in the AMASS app on iPhone and Android.
            </AppText>
          ) : null}
        </Animated.ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  chipsWrap: { height: 52 },
  chips: { paddingHorizontal: space[4], gap: 8, alignItems: "center" },
  chipDivider: { width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: 2 },
  group: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  pushCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: space[4], borderRadius: radii.lg, overflow: "hidden" },
  pushBell: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
});
