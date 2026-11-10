/**
 * Reactions — a like pill that toggles 👍 on tap and opens a floating emoji picker on long-press
 * (Facebook/LinkedIn-style). Picker animates in with a spring; each emoji pops on press.
 */
import React, { useEffect } from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { REACTION_EMOJI, REACTION_KEYS, REACTION_LABEL, type ReactionKey } from "@/src/lib/feedApi";
import { useTheme } from "@/src/theme";
import { boldFont, radii } from "@/src/theme/tokens";
import { AppText } from "@/src/ui";

export function ReactionPicker({ visible, current, onPick, onClose, style, testID = "feed-reaction-picker" }: { visible: boolean; current?: ReactionKey | null; onPick: (k: ReactionKey) => void; onClose: () => void; style?: ViewStyle; testID?: string }) {
  const { colors, shadows } = useTheme();
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = visible ? withSpring(1, { damping: 14, stiffness: 220 }) : withTiming(0, { duration: 120 });
  }, [visible, s]);
  const anim = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 0.6 + 0.4 * s.value }, { translateY: (1 - s.value) * 12 }] }));
  if (!visible) return null;
  return (
    <>
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} accessibilityLabel="Close reactions" />
      <Animated.View style={[styles.picker, { backgroundColor: colors.bgElevated, borderColor: colors.border }, shadows.lg, anim, style]} testID={testID}>
        {REACTION_KEYS.map((k) => (
          <EmojiButton key={k} k={k} active={current === k} onPress={() => onPick(k)} />
        ))}
      </Animated.View>
    </>
  );
}

function EmojiButton({ k, active, onPress }: { k: ReactionKey; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const sc = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <Pressable
      onPressIn={() => (sc.value = withSpring(1.35, { damping: 8 }))}
      onPressOut={() => (sc.value = withSpring(1))}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      style={[styles.emojiBtn, active && { backgroundColor: colors.brandSoft }]}
      accessibilityRole="button"
      accessibilityLabel={REACTION_LABEL[k]}
      accessibilityState={{ selected: active }}
      testID={`feed-react-${k}`}
    >
      <Animated.Text style={[styles.emoji, a]}>{REACTION_EMOJI[k]}</Animated.Text>
    </Pressable>
  );
}

/** Compact "👍❤️🔥 128" summary — top three reactions by count. */
export function ReactionSummary({ reactions, count, onPress, testID }: { reactions: Record<string, number>; count: number; onPress?: () => void; testID?: string }) {
  const { colors } = useTheme();
  if (!count) return null;
  const top = Object.entries(reactions)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => REACTION_EMOJI[k as ReactionKey]);
  return (
    <Pressable onPress={onPress} disabled={!onPress} hitSlop={6} style={styles.summary} accessibilityRole="button" accessibilityLabel={`${count} reactions`} testID={testID}>
      <View style={[styles.summaryEmojis, { backgroundColor: colors.surfaceAlt }]}>
        <AppText style={{ fontSize: 13, lineHeight: 16 }}>{top.join("")}</AppText>
      </View>
      <AppText variant="caption" tone="secondary" tabular>
        {count}
      </AppText>
    </Pressable>
  );
}

/** The like pill itself — shows the chosen emoji when reacted. */
export function ReactPill({ my, onPress, onLongPress, testID, compact = false }: { my?: ReactionKey | null; onPress: () => void; onLongPress: () => void; testID?: string; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      style={[styles.pill, { backgroundColor: my ? colors.brandSoft : colors.surfaceAlt }]}
      accessibilityRole="button"
      accessibilityLabel={my ? `You reacted ${REACTION_LABEL[my]}. Tap to remove, hold for more` : "Like. Hold for more reactions"}
      accessibilityState={{ selected: !!my }}
      testID={testID}
    >
      {my ? <AppText style={{ fontSize: 18, lineHeight: 22 }}>{REACTION_EMOJI[my]}</AppText> : <Ionicons name="heart-outline" size={20} color={colors.text} />}
      {compact && !my ? null : (
        <AppText variant="caption" numberOfLines={1} color={my ? colors.brand : colors.text} style={{ fontFamily: boldFont.semibold, flexShrink: 1 }}>
          {my ? REACTION_LABEL[my] : "Like"}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  picker: { position: "absolute", left: 8, bottom: 52, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, height: 54, borderRadius: 27, borderWidth: StyleSheet.hairlineWidth, zIndex: 30 },
  emojiBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 26, lineHeight: 32 },
  summary: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryEmojis: { paddingHorizontal: 6, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  pill: { flex: 0.95, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 44, paddingHorizontal: 6, borderRadius: radii.pill },
});
