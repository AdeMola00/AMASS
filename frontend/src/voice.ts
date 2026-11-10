import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";

// One module-level player for the whole app: only one sound plays at a time
// (screen guidance and voice notes share it).
let player: AudioPlayer | null = null;
let current: string | null = null;
let seq = 0;
const listeners = new Set<(url: string | null) => void>();

function emit(url: string | null) {
  current = url;
  listeners.forEach((l) => l(url));
}

export function subscribePlaying(fn: (url: string | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const playingUrl = () => current;
// Bumped by every stop/play — lets a slow voice request know it was cancelled.
export const audioSeq = () => seq;

export async function playUrl(url: string) {
  const mine = ++seq;
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
  if (mine !== seq) return;
  if (!player) {
    player = createAudioPlayer({ uri: url });
    player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) emit(null);
    });
  } else {
    player.pause();
    player.replace({ uri: url });
  }
  player.play();
  emit(url);
}

export function stopAudio() {
  seq++;
  if (player) player.pause();
  if (current) emit(null);
}
