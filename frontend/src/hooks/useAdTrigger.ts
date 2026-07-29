import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "@/src/lib/api";

const SESSION_MAX_ADS = 3;
const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 min

/**
 * useAdTrigger — smart trigger for the AdModal.
 *
 * Consumers call `noteInteraction()` to bump a counter (e.g. after a user
 * views 5 listings). When the counter passes `triggerAfter` AND the
 * frequency-cap allows, we fetch an ad and mark it visible.
 *
 * Also fires on mount if user has been idle at least `mountDelayMs`.
 */
export function useAdTrigger({
  triggerAfter = 5,
  context = "marketplace_home",
  enabled = true,
  mountDelayMs = 2500,
}: {
  triggerAfter?: number;
  context?: string;
  enabled?: boolean;
  mountDelayMs?: number;
} = {}) {
  const [ad, setAd] = useState<any | null>(null);
  const [visible, setVisible] = useState(false);
  const interactionCount = useRef(0);
  const lastShownAt = useRef(0);
  const shownThisSession = useRef(0);
  const shownAdIds = useRef<string[]>([]);
  const fetchInFlight = useRef(false);

  const canShow = useCallback(() => {
    if (!enabled) return false;
    if (shownThisSession.current >= SESSION_MAX_ADS) return false;
    if (Date.now() - lastShownAt.current < MIN_INTERVAL_MS) return false;
    return true;
  }, [enabled]);

  const fetchAndShow = useCallback(async () => {
    if (!canShow() || fetchInFlight.current) return;
    fetchInFlight.current = true;
    try {
      const r = await api.nextAd(context, shownAdIds.current);
      if (r.ad) {
        setAd(r.ad);
        setVisible(true);
        lastShownAt.current = Date.now();
        shownThisSession.current += 1;
        shownAdIds.current = [...shownAdIds.current, r.ad.id].slice(-10);
      }
    } catch {}
    finally {
      fetchInFlight.current = false;
    }
  }, [context, canShow]);

  const noteInteraction = useCallback(() => {
    interactionCount.current += 1;
    if (interactionCount.current >= triggerAfter) {
      interactionCount.current = 0;
      fetchAndShow();
    }
  }, [triggerAfter, fetchAndShow]);

  const dismiss = useCallback(() => {
    setVisible(false);
    // Keep ad object for exit animation, then clear.
    setTimeout(() => setAd(null), 400);
  }, []);

  // Auto-trigger once shortly after mount
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => fetchAndShow(), mountDelayMs);
    return () => clearTimeout(t);
  }, [enabled, mountDelayMs, fetchAndShow]);

  // Reset session-cap when app returns from deep background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // Consider a fresh session if we've been backgrounded long enough
        if (Date.now() - lastShownAt.current > 30 * 60 * 1000) {
          shownThisSession.current = 0;
        }
      }
    });
    return () => sub.remove();
  }, []);

  return { ad, visible, dismiss, noteInteraction };
}
