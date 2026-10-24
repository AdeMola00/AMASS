/**
 * Neighbours — hub tab. One lightweight screen that connects estates, friends, shared
 * collections, events, local help and messages. No endless feed: everything is a bounded
 * section with a clear next step, and property cards keep their paid action.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, NeighboursHome } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { Appear, AppText, Avatar, Badge, Card, EmptyState, IconButton, PressableScale, Screen, Section, SkeletonCard, useBounceRefresh, type IconName } from "@/src/ui";
import { useUnreadNotifications } from "@/src/hooks/use-unread-notifications";
import { EventRow } from "@/src/components/neighbours/EventRow";
import { PostRow } from "@/src/components/neighbours/PostRow";

type Quick = { key: string; label: string; icon: IconName; tone: "default" | "brand" | "mass" | "fix" | "success" | "warning" | "info" | "premium"; route: string; testID: string };

export default function NeighboursTab() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [data, setData] = useState<NeighboursHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unread, setUnread] = useState(0);
  const { unread: notifUnread } = useUnreadNotifications();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [home, un] = await Promise.all([api.neighboursHome(), api.chatUnreadCount().catch(() => ({ unread_count: 0 }))]);
      setData(home);
      setUnread(un.unread_count ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  const { refreshControl, bounceStyle } = useBounceRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => {
    track("neighbours_open");
  }, []);

  const approved = data?.estates.filter((e) => e.membership?.status === "approved") ?? [];
  const pendingEstate = data?.estates.find((e) => e.membership?.status === "pending");

  const quick: Quick[] = [
    { key: "friends", label: data?.connections.pending_in ? `Friends · ${data.connections.pending_in} new` : "Friends", icon: "people", tone: "brand", route: "/neighbours/friends", testID: "nb-quick-friends" },
    { key: "collections", label: "Shared lists", icon: "albums", tone: "mass", route: "/neighbours/collections", testID: "nb-quick-collections" },
    { key: "places", label: "Local map", icon: "location", tone: "info", route: "/neighbours/places", testID: "nb-quick-places" },
    { key: "events", label: "Events", icon: "calendar", tone: "success", route: "/neighbours/events", testID: "nb-quick-events" },
  ];

  return (
    <Screen testID="neighbours-screen">
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="hero" style={width < 360 ? { fontSize: 26, lineHeight: 32 } : undefined} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="neighbours-title">
            neighbours
          </AppText>
          <AppText variant="bodySm" tone="secondary">
            Decide together · Know your estate · Find local help
          </AppText>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View>
            <IconButton icon="chatbubbles-outline" label="Messages" onPress={() => router.push("/inbox" as any)} testID="nb-inbox" />
            {unread > 0 ? (
              <View style={[styles.dot, { backgroundColor: colors.brand, borderColor: colors.bg }]} pointerEvents="none">
                <AppText variant="micro" color="#fff" tabular>
                  {unread > 99 ? "99+" : unread}
                </AppText>
              </View>
            ) : null}
          </View>
          <IconButton icon="notifications-outline" label="Notifications" badge={notifUnread} onPress={() => router.push("/notifications" as any)} testID="nb-notifications" />
          <IconButton icon="options-outline" label="Privacy & settings" onPress={() => router.push("/neighbours/settings" as any)} testID="nb-settings" />
        </View>
      </View>

      <Animated.ScrollView style={bounceStyle} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error || !data ? (
          <EmptyState variant="error" title="Couldn't load Neighbours" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} testID="nb-error" />
        ) : (
          <>
            {/* Quick actions */}
            <View style={styles.quickRow}>
              {quick.map((q, i) => (
                <Appear key={q.key} index={i} style={{ flex: 1 }}>
                  <PressableScale onPress={() => router.push(q.route as any)} style={[styles.quick, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={q.label} testID={q.testID}>
                    <View style={[styles.quickIcon, { backgroundColor: colors.surface }]}>
                      <Ionicons name={q.icon} size={18} color={toneColor(colors, q.tone)} />
                    </View>
                    <AppText variant="micro" numberOfLines={1} align="center" style={{ letterSpacing: 0 }}>
                      {width < 360 ? q.label.replace("Shared lists", "Lists").replace("Local map", "Map") : q.label}
                    </AppText>
                  </PressableScale>
                </Appear>
              ))}
            </View>

            {/* My estate */}
            {approved.length === 0 ? (
              <Card elevation="sm" style={{ gap: 12 }} testID="nb-join-estate">
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <View style={[styles.estateIcon, { backgroundColor: colors.brandSoft }]}>
                    <Ionicons name="business" size={22} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="title">{pendingEstate ? `Waiting for ${pendingEstate.name}` : "Join your estate"}</AppText>
                    <AppText variant="caption" tone="secondary">
                      {pendingEstate ? "Management is verifying your residence. You'll be notified once approved." : "Official notices, neighbour Q&A, events and maintenance requests — residents only."}
                    </AppText>
                  </View>
                </View>
                <PressableScale onPress={() => router.push("/neighbours/estates" as any)} style={[styles.inlineBtn, { backgroundColor: colors.primary }]} accessibilityRole="button" testID="nb-find-estate">
                  <AppText variant="bodyMedium" color={colors.onPrimary}>
                    {pendingEstate ? "View estates" : "Find my estate"}
                  </AppText>
                  <Ionicons name="arrow-forward" size={16} color={colors.onPrimary} />
                </PressableScale>
              </Card>
            ) : (
              approved.map((e) => (
                <View key={e.id} style={{ gap: 8 }}>
                  <Pressable onPress={() => router.push(`/neighbours/estates/${e.id}` as any)} accessibilityRole="button" accessibilityLabel={`Open ${e.name}`} testID={`nb-estate-${e.id}`}>
                    <Card elevation="sm" padded={false} style={{ overflow: "hidden" }}>
                      {e.cover_image ? <Image source={{ uri: e.cover_image }} style={styles.cover} contentFit="cover" transition={150} /> : null}
                      <View style={{ padding: 14, gap: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <AppText variant="title" style={{ flex: 1 }} numberOfLines={1}>
                            {e.name}
                          </AppText>
                          <Badge label={e.membership?.role === "manager" ? "Manager" : "Verified resident"} tone={e.membership?.role === "manager" ? "brand" : "success"} icon="shield-checkmark" size="xs" />
                        </View>
                        <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
                          <Stat icon="people-outline" label={`${e.member_count ?? 0} residents`} />
                          <Stat icon="calendar-outline" label={`${e.upcoming_events ?? 0} upcoming`} />
                          <Stat icon="help-circle-outline" label={`${e.open_questions ?? 0} open questions`} />
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                  {e.is_manager && e.pending_requests ? (
                    <Pressable
                      onPress={() => router.push(`/neighbours/estates/${e.id}?tab=people` as any)}
                      style={({ pressed }) => [styles.alertRow, { backgroundColor: colors.warningSoft, borderColor: colors.warning }, pressed && { opacity: 0.9 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${e.pending_requests} join requests waiting for ${e.name}. Review now.`}
                      testID={`nb-join-alert-${e.id}`}
                    >
                      <View style={[styles.alertIcon, { backgroundColor: colors.warning }]}>
                        <Ionicons name="person-add" size={14} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodySm" weight="bold">
                          {e.pending_requests} resident{e.pending_requests === 1 ? "" : "s"} waiting to join
                        </AppText>
                        <AppText variant="micro" tone="secondary">
                          Verify their unit or proof so they can see the feed.
                        </AppText>
                      </View>
                      <AppText variant="caption" weight="bold" color={colors.warning}>
                        Review
                      </AppText>
                      <Ionicons name="chevron-forward" size={14} color={colors.warning} />
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}

            {/* Official notices */}
            {data.notices.length ? (
              <Section title="Official notices" caption="From estate management">
                <View style={{ gap: 8 }}>
                  {data.notices.map((n) => (
                    <PostRow key={n.id} post={n} onPress={() => router.push(`/neighbours/posts/${n.id}` as any)} />
                  ))}
                </View>
              </Section>
            ) : null}

            {/* Friends */}
            <Section title="Friends & couples" caption={data.connections.count ? `${data.connections.count} connection${data.connections.count === 1 ? "" : "s"}` : "Decide on homes together"} actionLabel={data.connections.count ? "See all" : "Find friends"} onAction={() => router.push((data.connections.count ? "/neighbours/friends" : "/neighbours/find-friends") as any)}>
              {data.connections.count === 0 ? (
                <Card tone="soft">
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <Ionicons name="heart-circle" size={34} color={colors.brand} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyMedium">Shortlist homes with your partner</AppText>
                      <AppText variant="caption" tone="secondary">
                        Connect, share a private list, react and comment — then unlock the one you both love.
                      </AppText>
                    </View>
                  </View>
                </Card>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: space[4] }} testID="nb-friends-row">
                  {data.connections.preview.map((u) => (
                    <Pressable key={u.id} onPress={() => router.push(`/neighbours/users/${u.id}` as any)} style={{ alignItems: "center", width: 64, gap: 4 }} accessibilityRole="button" accessibilityLabel={u.full_name}>
                      <Avatar name={u.full_name} uri={u.avatar_url} size={52} verified={u.verified} tone="soft" />
                      <AppText variant="micro" numberOfLines={1}>
                        {u.full_name.split(" ")[0]}
                      </AppText>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => router.push("/neighbours/find-friends" as any)} style={{ alignItems: "center", width: 64, gap: 4 }} accessibilityRole="button" accessibilityLabel="Find friends" testID="nb-add-friend">
                    <View style={[styles.addCircle, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      <Ionicons name="person-add" size={20} color={colors.text} />
                    </View>
                    <AppText variant="micro" numberOfLines={1}>
                      Add
                    </AppText>
                  </Pressable>
                </ScrollView>
              )}
            </Section>

            {/* Shared collections */}
            <Section title="Shared lists" caption="Private — only people you invite" actionLabel={data.collections.length ? "See all" : "Create"} onAction={() => router.push("/neighbours/collections" as any)}>
              {data.collections.length === 0 ? (
                <Pressable onPress={() => router.push("/neighbours/collections?create=1" as any)} style={[styles.dashed, { borderColor: colors.border }]} accessibilityRole="button" testID="nb-create-collection">
                  <Ionicons name="add-circle-outline" size={20} color={colors.textSecondary} />
                  <AppText variant="bodySm" tone="secondary">
                    Start “Homes to view” and invite someone
                  </AppText>
                </Pressable>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {data.collections.map((c) => (
                    <PressableScale key={c.id} onPress={() => router.push(`/neighbours/collections/${c.id}` as any)} style={[styles.collCard, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={c.name} testID={`nb-collection-${c.id}`}>
                      <View style={styles.collCovers}>
                        {c.cover_images.length ? c.cover_images.slice(0, 3).map((u, i) => <Image key={i} source={{ uri: u }} style={styles.collCover} contentFit="cover" />) : <View style={[styles.collCover, { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }]}><AppText variant="h2">{c.emoji || "🏠"}</AppText></View>}
                      </View>
                      <AppText variant="bodyMedium" numberOfLines={1}>
                        {c.emoji} {c.name}
                      </AppText>
                      <AppText variant="micro" tone="tertiary">
                        {c.item_count} saved · {c.member_count} {c.member_count === 1 ? "person" : "people"}
                      </AppText>
                    </PressableScale>
                  ))}
                </ScrollView>
              )}
            </Section>

            {/* Events */}
            {data.events.length ? (
              <Section title="Coming up" actionLabel="All events" onAction={() => router.push("/neighbours/events" as any)}>
                <View style={{ gap: 8 }}>
                  {data.events.slice(0, 3).map((ev) => (
                    <EventRow key={ev.id} event={ev} onPress={() => router.push(`/neighbours/events/${ev.id}` as any)} />
                  ))}
                </View>
              </Section>
            ) : null}

            {/* Local help */}
            <Section title="Local help" caption={approved.length ? "Neighbours answer fast" : "Join an estate to ask neighbours"}>
              <View style={{ gap: 8 }}>
                {data.open_questions.map((q) => (
                  <PostRow key={q.id} post={q} onPress={() => router.push(`/neighbours/posts/${q.id}` as any)} />
                ))}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <PressableScale onPress={() => router.push((approved.length ? `/neighbours/estates/${approved[0].id}?compose=question` : "/neighbours/estates") as any)} style={[styles.helpBtn, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" testID="nb-ask">
                    <Ionicons name="help-circle-outline" size={18} color={colors.text} />
                    <AppText variant="bodySm">Ask neighbours</AppText>
                  </PressableScale>
                  <PressableScale onPress={() => router.push((approved.length ? `/neighbours/services/new?estate_id=${approved[0].id}` : "/neighbours/estates") as any)} style={[styles.helpBtn, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" testID="nb-report-issue">
                    <Ionicons name="construct-outline" size={18} color={colors.fix} />
                    <AppText variant="bodySm">{data.open_service_requests ? `Issues · ${data.open_service_requests} open` : "Report an issue"}</AppText>
                  </PressableScale>
                </View>
              </View>
            </Section>

            {/* Recognition */}
            {data.profile.points > 0 || data.profile.badges.length > 0 ? (
              <Pressable onPress={() => router.push("/neighbours/settings?tab=recognition" as any)} accessibilityRole="button" testID="nb-recognition">
                <Card tone="soft">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Ionicons name="ribbon" size={22} color={colors.premium} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyMedium">{data.profile.points} thank-you points</AppText>
                      <AppText variant="micro" tone="tertiary">
                        Recognition from your community · no cash value, never unlocks paid details
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            ) : null}

            {!data.phone_verified ? (
              <Pressable onPress={() => router.push({ pathname: "/(auth)/phone", params: { purpose: "link" } } as any)} accessibilityRole="button" testID="nb-verify-phone">
                <Card tone="soft">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Ionicons name="phone-portrait-outline" size={20} color={colors.text} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyMedium">Verify your phone</AppText>
                      <AppText variant="micro" tone="tertiary">
                        Lets friends find you (only if you allow it) and speeds up estate approval.
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            ) : null}
            <AppText variant="micro" tone="tertiary" align="center" style={{ marginTop: 4 }}>
              Signed in as {user?.full_name}. Your exact address and phone are never shown to others.
            </AppText>
          </>
        )}
      </Animated.ScrollView>
    </Screen>
  );
}

function Stat({ icon, label }: { icon: IconName; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons name={icon} size={13} color={colors.textTertiary} />
      <AppText variant="micro" tone="secondary" tabular>
        {label}
      </AppText>
    </View>
  );
}

function toneColor(colors: any, tone: Quick["tone"]) {
  return ({ default: colors.text, brand: colors.brand, mass: colors.massText ?? colors.mass, fix: colors.fixText ?? colors.fix, success: colors.success, warning: colors.warning, info: colors.info, premium: colors.premium } as any)[tone];
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[3], gap: 8 },
  dot: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  scroll: { paddingHorizontal: space[4], paddingBottom: 130, gap: space[4] },
  quickRow: { flexDirection: "row", gap: 8 },
  quick: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: radii.lg },
  quickIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  estateIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  inlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radii.pill },
  cover: { width: "100%", height: 120 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth },
  alertIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  addCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dashed: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderRadius: radii.md, borderWidth: 1, borderStyle: "dashed" },
  collCard: { width: 168, padding: 10, borderRadius: radii.lg, gap: 6 },
  collCovers: { flexDirection: "row", gap: 3, height: 64, borderRadius: radii.sm, overflow: "hidden" },
  collCover: { flex: 1, height: "100%" },
  helpBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: radii.pill },
});
