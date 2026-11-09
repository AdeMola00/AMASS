/**
 * Server-metered map time for the Find Home screen: 1 MASS buys 60 minutes while the tab is in front.
 *
 *   • `applyMapTime`  — apply a meter reading (from the markers call or the heartbeat): announce a charge, hide
 *                        the homes when the hour ran out on an empty wallet, arm the "homes unlocked" moment.
 *   • heartbeat        — once a minute while focused AND the app is active; a top-up flips `access` back on and
 *                        the homes reload (`reloadHomes`).
 *   • unlock pending   — set when Get MASS is tapped from the gate (persisted, 2 h) or when the meter flips back
 *                        on; the next markers load calls `celebrateUnlock`.
 *   • last hour        — the wallet can't afford the next hour; dismissable per charged hour (persisted).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, type MapTime } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { useWallet } from "@/src/contexts/wallet";
import { useCelebrate, useMoneyRain, useToast } from "@/src/ui";
import { track } from "@/src/lib/analytics";

/** Set when Get MASS is tapped from the empty-wallet notice; the next load that finds homes celebrates them (survives a remount). */
const GATE_PENDING_KEY = "amass_map_gate_pending_v1";
const GATE_PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const LAST_HOUR_DISMISSED_KEY = "amass_map_last_hour_dismissed_v1";

type Opts = {
  /** The hour ran out on an empty wallet — clear the drawn homes. */
  onHomesHidden: () => void;
  /** A top-up landed while gated — fetch the homes again and bring them into view. */
  reloadHomes: () => void;
  /** The "Homes unlocked" burst has cleared — e.g. show the first-timer coach mark. */
  onCelebrated: () => void;
};

export function useMapTimeMeter(opts: Opts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const router = useRouter();
  const toast = useToast();
  const { rain, rainClearsAt } = useMoneyRain();
  const celebrate = useCelebrate();
  const { refresh: refreshWallet } = useWallet();

  const [mapTime, setMapTime] = useState<MapTime | null>(null);
  const mapTimeRef = useRef<MapTime | null>(null);
  mapTimeRef.current = mapTime;
  /** Celebration timers — cleared if the screen goes away mid-burst. */
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const gated = !!mapTime && !mapTime.access;

  /** This paid hour is the last the wallet can afford — surfaced gently so browsing never just stops. */
  const lastHour = !!mapTime && mapTime.access && mapTime.metered && mapTime.remaining_seconds != null && mapTime.balance < mapTime.hourly_cost;
  const [lastHourDismissedFor, setLastHourDismissedFor] = useState<number | null>(null);
  useEffect(() => {
    storage.getItem<number | null>(LAST_HOUR_DISMISSED_KEY, null).then((h) => { if (typeof h === "number") setLastHourDismissedFor(h); }).catch(() => {});
  }, []);
  const dismissLastHour = useCallback((hour: number) => {
    setLastHourDismissedFor(hour);
    storage.setItem(LAST_HOUR_DISMISSED_KEY, hour);
  }, []);
  const showLastHour = lastHour && lastHourDismissedFor !== mapTime!.hours_charged;

  /** True when the wallet was empty and a top-up is expected — the next markers load celebrates the homes lighting up. */
  const unlockPendingRef = useRef(false);
  /** Call during bootstrap (before the first markers load) so a remount after the purchase still celebrates. */
  const restoreUnlockPending = useCallback(
    () =>
      storage.getItem<number | null>(GATE_PENDING_KEY, null).then((at) => {
        if (typeof at === "number" && Date.now() - at < GATE_PENDING_MAX_AGE_MS) unlockPendingRef.current = true;
        else if (at != null) storage.removeItem(GATE_PENDING_KEY);
      }),
    []
  );

  /** Get MASS from the map → come back here after the purchase (the success sheet's Continue pops back to this tab).
   *  Leaving from the empty-wallet notice arms the "homes unlocked" moment for the return. */
  const goGetMass = useCallback(() => {
    if (mapTimeRef.current && !mapTimeRef.current.access) {
      unlockPendingRef.current = true;
      storage.setItem(GATE_PENDING_KEY, Date.now());
    }
    router.push({ pathname: "/buy-tokens", params: { currency: "MASS", returnTo: "/" } } as any);
  }, [router]);

  /** Apply a meter reading: announce a charge (toast + subtle rain), and when the hour ran out on an empty wallet
   *  clear the homes and point to Get MASS. The wallet badge refreshes after every charge. */
  const applyMapTime = useCallback(
    (mt: MapTime) => {
      const prev = mapTimeRef.current;
      setMapTime(mt);
      // Wallet was empty, now it isn't: the homes are about to light up — hold the generic charge toast and let
      // the markers load celebrate instead (it knows how many homes appeared).
      if (!!prev && !prev.access && mt.access) unlockPendingRef.current = true;
      const justUnlocked = mt.access && unlockPendingRef.current;
      if (mt.charged_now) {
        refreshWallet().catch(() => {});
        track("map_time_charged", { hour: mt.hours_charged, cost: mt.hourly_cost });
        if (!justUnlocked) {
          rain({ variant: "subtle", key: `maptime:${mt.hours_charged}` });
          toast.show({
            kind: "success",
            title: mt.hours_charged <= 1 ? `Map time started · ${mt.hourly_cost} MASS` : `Another hour on the map · ${mt.hourly_cost} MASS`,
            body: mt.hours_charged <= 1 ? "Homes show for 60 minutes on the map. The next hour is only charged while you're still browsing." : `${mt.balance} MASS left in your wallet.`,
          });
        }
      }
      if (!mt.access) {
        optsRef.current.onHomesHidden();
        if (prev?.access) {
          track("map_time_exhausted", { hours: mt.hours_charged });
          toast.show({ kind: "info", title: "Out of MASS — homes hidden", body: "Top up to keep browsing the map.", actionLabel: "Get MASS", onAction: goGetMass });
        }
      }
    },
    [refreshWallet, rain, toast, goGetMass]
  );

  /** The homes just came back after a top-up: a short burst over the map, then the pins stay. Waits for the
   *  purchase's money rain (if it is still falling) so the two moments don't pile up. */
  const celebrateUnlock = useCallback(
    (count: number, mt: MapTime | null) => {
      unlockPendingRef.current = false;
      storage.removeItem(GATE_PENDING_KEY);
      const cost = mt?.hourly_cost ?? 0;
      track("map_homes_unlocked", { homes: count, hour: mt?.hours_charged ?? 0, cost });
      if (count > 0) {
        const burst = () =>
          celebrate({
            tone: "mass",
            icon: "home",
            title: "Homes unlocked!",
            body: `${count >= 400 ? "400+" : count} ${count === 1 ? "home is" : "homes are"} now live across the map${cost ? ` · ${cost} MASS buys 60 minutes` : ""}`,
          });
        const wait = Math.min(Math.max(rainClearsAt() - Date.now(), 0), 3200);
        timersRef.current.push(setTimeout(burst, wait));
        // Once the burst has cleared, show first-timers how to open a home.
        timersRef.current.push(setTimeout(() => optsRef.current.onCelebrated(), wait + 2700));
      } else {
        // Nothing matches the current filters here — still worth saying the map is live again.
        toast.show({ kind: "success", title: cost ? `Map time started · ${cost} MASS` : "You're back on the map", body: "Widen the filters or move the map to see homes." });
      }
    },
    [celebrate, toast, rainClearsAt]
  );

  // Heartbeat: once a minute while this tab is in front AND the app is active. Leaving the tab or backgrounding
  // the app stops the clock (the server never counts a gap). Coming back with a topped-up wallet after the homes
  // were hidden → the first heartbeat buys the next hour and the homes reload.
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | null = null;
      let stopped = false;
      const tick = async () => {
        if (stopped || AppState.currentState !== "active") return;
        try {
          const before = mapTimeRef.current;
          const mt = await api.mapTimeTick();
          if (stopped) return;
          applyMapTime(mt);
          if (mt.access && before && !before.access) optsRef.current.reloadHomes();
        } catch {}
      };
      const start = () => {
        if (timer) return;
        timer = setInterval(tick, 60_000);
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
      };
      // Only heartbeat on our own once the first markers load has reported the meter (it already ticked).
      if (mapTimeRef.current) tick();
      start();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") {
          tick();
          start();
        } else stop();
      });
      return () => {
        stopped = true;
        stop();
        sub.remove();
      };
    }, [applyMapTime])
  );

  return { mapTime, mapTimeRef, gated, lastHour, showLastHour, dismissLastHour, goGetMass, applyMapTime, celebrateUnlock, unlockPendingRef, restoreUnlockPending };
}
