import { useEffect } from "react";
import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

const DOOR = require("../../../assets/sounds/intro_door.wav");

/**
 * Opening-sequence sound: one subtle door-opening (latch release + a soft hinge creak), timed to the moment
 * the door in the AMASS logo swings ajar. Native only — browsers block audio before a user gesture.
 *
 * Respects the phone: `playsInSilentMode: false` keeps us quiet when the iOS ring/silent switch is on silent,
 * and `mixWithOthers` never pauses the listener's music or podcast. Android has no hardware switch; its media
 * volume (which the user controls) governs the sound, as it does for every other app.
 */
export function useIntroSounds({ enabled, doorDelay }: { enabled: boolean; doorDelay: number }) {
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let door: AudioPlayer | null = null;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers", allowsRecording: false, shouldPlayInBackground: false });
        if (cancelled) return;
        door = createAudioPlayer(DOOR);
        door.volume = 0.45;
        timer = setTimeout(() => {
          if (!cancelled) door?.play();
        }, doorDelay);
      } catch {}
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      try {
        door?.remove();
      } catch {}
    };
  }, [enabled, doorDelay]);
}
