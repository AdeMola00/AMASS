/**
 * Updates tab — everything new for you, AMASS-branded.
 *   Activity · price drops, saved-search matches, messages, receipts, ID & document reviews
 *   Nearby   · items neighbours are giving away or selling around you
 * Header: AMASS emblem, title, live unread subtitle, inbox + preferences; segmented switch below.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { useTabBarOffset } from "@/src/lib/tabBar";
import { AppText, IconButton, Screen, SegmentedControl } from "@/src/ui";
import { AmassLogo } from "@/src/components/AmassLogo";
import { NotificationFeed, type NotificationFeedHandle } from "@/src/components/notifications/NotificationFeed";
import { SocialFeed } from "@/src/components/social/SocialFeed";

type Segment = "activity" | "nearby";
const SEGMENT_KEY = "amass_updates_segment_v1";

export default function UpdatesTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ tab?: string; category?: string }>();
  const tabBarOffset = useTabBarOffset();
  const feed = useRef<NotificationFeedHandle>(null);
  const [segment, setSegment] = useState<Segment | null>(params.tab === "nearby" ? "nearby" : params.tab === "activity" ? "activity" : null);
  const [visibleUnread, setVisibleUnread] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  // Remember the last segment; a deep link (?tab=) always wins.
  useEffect(() => {
    if (segment) return;
    storage.getItem<Segment>(SEGMENT_KEY, "activity").then((s) => setSegment(s === "nearby" ? "nearby" : "activity"));
  }, [segment]);
  useEffect(() => {
    if (params.tab === "nearby" || params.tab === "activity") setSegment(params.tab);
  }, [params.tab]);

  const choose = (s: Segment) => {
    setSegment(s);
    storage.setItem(SEGMENT_KEY, s);
  };

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      api.chatUnreadCount().then((c) => setChatUnread(c.unread_count ?? 0)).catch(() => {});
      // The feed loads itself on mount; only re-pull when coming back to the tab.
      if (firstFocus.current) firstFocus.current = false;
      else feed.current?.reload();
    }, [])
  );

  const onUnread = useCallback((visible: number, total: number) => {
    setVisibleUnread(visible);
    setTotalUnread(total);
  }, []);

  const maxW = Math.min(width, 720);
  const subtitle = segment === "nearby" ? "Free & for-sale items from neighbours" : totalUnread > 0 ? `${totalUnread} unread update${totalUnread === 1 ? "" : "s"}` : "You're all caught up";

  return (
    <Screen edges={[]} testID="updates-screen">
      <View style={[styles.header, { paddingTop: insets.top + 6, alignSelf: "center", width: maxW }]}>
        {width >= 360 ? (
          <View style={[styles.emblem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AmassLogo size={26} showWordmark={false} testID="updates-emblem" />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <AppText variant="h2" numberOfLines={1} testID="updates-title">
            Updates
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1} testID="updates-subtitle">
            {subtitle}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          {segment === "activity" ? <IconButton icon="checkmark-done" label="Mark all as read" onPress={() => feed.current?.markAllRead()} disabled={visibleUnread === 0} testID="updates-mark-all" /> : null}
          <IconButton icon="chatbubbles-outline" label="Messages" badge={chatUnread} onPress={() => router.push("/inbox" as any)} testID="updates-inbox" />
          <IconButton icon="options-outline" label="Notification preferences" onPress={() => router.push("/notification-preferences" as any)} testID="updates-prefs" />
        </View>
      </View>

      <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: space[4], paddingBottom: space[2] }}>
        <SegmentedControl<Segment>
          value={segment ?? "activity"}
          onChange={choose}
          testIDPrefix="updates-seg"
          options={[
            { value: "activity", label: totalUnread > 0 ? `Activity · ${totalUnread > 99 ? "99+" : totalUnread}` : "Activity", icon: "notifications-outline" },
            { value: "nearby", label: "Nearby", icon: "gift-outline" },
          ]}
        />
      </View>

      {segment === "nearby" ? (
        <SocialFeed />
      ) : (
        <NotificationFeed ref={feed} initialCategory={typeof params.category === "string" ? params.category : undefined} bottomPadding={tabBarOffset + 24} onUnreadChange={onUnread} testID="updates-activity-list" />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingBottom: space[3] },
  emblem: { width: 44, height: 44, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
});
