/** /notifications — pushed from bells across the app; same feed as the Updates tab's Activity segment. */
import React, { useCallback, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { IconButton, Screen, ScreenHeader } from "@/src/ui";
import { NotificationFeed, type NotificationFeedHandle } from "@/src/components/notifications/NotificationFeed";

export default function Notifications() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const feed = useRef<NotificationFeedHandle>(null);
  const [visibleUnread, setVisibleUnread] = useState(0);
  const onUnread = useCallback((visible: number) => setVisibleUnread(visible), []);

  return (
    <Screen testID="notifications-screen">
      <ScreenHeader
        title="Notifications"
        subtitle={visibleUnread > 0 ? `${visibleUnread} unread` : "You're all caught up"}
        right={
          <>
            <IconButton icon="checkmark-done" label="Mark all as read" onPress={() => feed.current?.markAllRead()} disabled={visibleUnread === 0} testID="notif-mark-all" />
            <IconButton icon="options-outline" label="Notification preferences" onPress={() => router.push("/notification-preferences" as any)} testID="notif-prefs" />
          </>
        }
      />
      <NotificationFeed ref={feed} initialCategory={typeof params.category === "string" ? params.category : undefined} onUnreadChange={onUnread} />
    </Screen>
  );
}
