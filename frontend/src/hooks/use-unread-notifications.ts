import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";

/**
 * Unread badge for the Notification Center bell. Refreshes on focus, on
 * foreground and every 45s while focused — cheap single count endpoint.
 */
export function useUnreadNotifications(pollMs = 45_000) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return setUnread(0);
    try {
      const r = await api.notifUnreadCount();
      setUnread(r.unread ?? 0);
    } catch {}
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      timer.current = setInterval(refresh, pollMs);
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") refresh();
      });
      return () => {
        if (timer.current) clearInterval(timer.current);
        sub.remove();
      };
    }, [refresh, pollMs])
  );

  useEffect(() => {
    if (!user) setUnread(0);
  }, [user]);

  return { unread, refresh, setUnread };
}
