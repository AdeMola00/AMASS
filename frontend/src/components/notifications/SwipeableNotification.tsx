/**
 * One-thumb read-state gestures for a notification row.
 *   swipe →  (reveals the left pane)  = mark read / mark unread
 *   swipe ←  (reveals the right pane) = dismiss (host shows an Undo toast)
 * A full swipe fires the action and snaps the row back; a partial swipe shows the pane, which is tappable too.
 */
import React, { useRef } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { AppText, type IconName } from "@/src/ui";

const PANE_W = 96;

/**
 * Web mouse-drags also fire the row's onPress on release, so hosts call `swipedRecently()` to ignore
 * taps that end a swipe. A drag sets the flag; it clears 400 ms after the row settles (will-open/close),
 * with a 5 s fail-safe so a lost event can never leave rows un-tappable.
 */
let swipeActive = false;
let lastSettledAt = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
export const swipedRecently = () => swipeActive || Date.now() - lastSettledAt < 600;
const dragStart = () => {
  swipeActive = true;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    swipeActive = false;
  }, 5000);
};
const settle = () => {
  lastSettledAt = Date.now();
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    swipeActive = false;
  }, 400);
};

export function SwipeableNotification({ read, onToggleRead, onDismiss, children, testID }: { read: boolean; onToggleRead: () => void; onDismiss: () => void; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const ref = useRef<SwipeableMethods>(null);

  const fire = (action: () => void) => {
    settle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    ref.current?.close();
    action();
  };

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      leftThreshold={PANE_W * 0.7}
      rightThreshold={PANE_W * 0.7}
      overshootFriction={6}
      onSwipeableOpenStartDrag={dragStart}
      onSwipeableCloseStartDrag={dragStart}
      onSwipeableWillOpen={settle}
      onSwipeableWillClose={settle}
      onSwipeableClose={settle}
      onSwipeableOpen={(dir) => fire(dir === SwipeDirection.RIGHT ? onToggleRead : onDismiss)}
      renderLeftActions={(progress) => (
        <Pane progress={progress} side="left" bg={read ? colors.surfaceInverse : colors.brand} fg={read ? colors.textInverse : colors.onBrand} icon={read ? "mail-unread-outline" : "mail-open-outline"} label={read ? "Mark unread" : "Mark read"} onPress={() => fire(onToggleRead)} testID={testID ? `${testID}-read-pane` : undefined} />
      )}
      renderRightActions={(progress) => <Pane progress={progress} side="right" bg={colors.error} fg={colors.onBrand} icon="close-circle-outline" label="Dismiss" onPress={() => fire(onDismiss)} testID={testID ? `${testID}-dismiss-pane` : undefined} />}
      testID={testID}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function Pane({ progress, side, bg, fg, icon, label, onPress, testID }: { progress: SharedValue<number>; side: "left" | "right"; bg: string; fg: string; icon: IconName; label: string; onPress: () => void; testID?: string }) {
  const anim = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0.6, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1, 1.6], [0.7, 1, 1.12]) }],
  }));
  return (
    <Pressable onPress={onPress} style={[styles.pane, { backgroundColor: bg, alignItems: side === "left" ? "flex-start" : "flex-end" }]} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <Animated.View style={[styles.paneInner, anim]}>
        <Ionicons name={icon} size={22} color={fg} />
        <AppText variant="micro" color={fg} style={styles.paneLabel} numberOfLines={1}>
          {label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pane: { width: PANE_W, justifyContent: "center", paddingHorizontal: 14 },
  paneInner: { alignItems: "center", gap: 4, width: PANE_W - 28 },
  paneLabel: { fontFamily: "PlusJakartaSans-700", fontSize: 12.5 },
});
