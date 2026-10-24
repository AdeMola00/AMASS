/**
 * Photo pager — swipe through a home's photos inside a tile without opening it.
 * Each page is pressable (opens the listing); dots + "n / N" counter sit on the photo.
 * Locked homes pass a single blurred cover (the gallery is part of the MASS unlock).
 */
import React, { useRef, useState } from "react";
import { Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { AppText } from "@/src/ui";

const MAX_DOTS = 8;

export function PhotoPager({
  images,
  total,
  height,
  blur = 0,
  onPress,
  accessibilityLabel,
  testID,
}: {
  images: string[];
  /** Total photos on the listing (locked tiles only receive the cover but still show "1 / N"). */
  total?: number;
  height: number;
  blur?: number;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const lastHaptic = useRef(0);
  const pages = images.length ? images : [""];
  const count = Math.max(total ?? pages.length, pages.length);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      setIndex(i);
      if (Date.now() - lastHaptic.current > 150) {
        lastHaptic.current = Date.now();
        Haptics.selectionAsync().catch(() => {});
      }
    }
  };

  return (
    <View style={[styles.wrap, { height, backgroundColor: colors.surfaceAlt }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID={testID}>
      {width ? (
        <ScrollView
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          scrollEnabled={pages.length > 1}
          style={{ width, height }}
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          testID={testID ? `${testID}-scroll` : undefined}
        >
          {pages.map((uri, i) => (
            <Pressable key={`${uri}-${i}`} onPress={onPress} style={{ width, height }} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} of ${count}. Open listing`} testID={testID ? `${testID}-page-${i}` : undefined}>
              {uri && !failed[i] ? (
                <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={blur} onError={() => setFailed((f) => ({ ...f, [i]: true }))} accessibilityIgnoresInvertColors />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.center]}>
                  <Ionicons name="home" size={40} color={colors.textTertiary} />
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {count > 1 ? (
        <View style={styles.counter} pointerEvents="none" testID={testID ? `${testID}-counter` : undefined}>
          <Ionicons name="images" size={11} color="#fff" />
          <AppText variant="micro" color="#fff" tabular style={{ fontFamily: "PlusJakartaSans-700" }}>
            {index + 1} / {count}
          </AppText>
        </View>
      ) : null}
      {pages.length > 1 && pages.length <= MAX_DOTS ? (
        <View style={styles.dots} pointerEvents="none">
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, { opacity: i === index ? 1 : 0.5, width: i === index ? 14 : 6 }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  center: { alignItems: "center", justifyContent: "center" },
  counter: { position: "absolute", right: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: "rgba(17,17,17,0.6)" },
  dots: { position: "absolute", left: 0, right: 0, bottom: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 },
  dot: { height: 6, borderRadius: 3, backgroundColor: "#fff" },
});
