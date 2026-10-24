import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";


const { width } = Dimensions.get("window");

export function ImageGallery({
  images,
  height = 340,
}: {
  images: string[];
  height?: number;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [idx, setIdx] = useState(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== idx) setIdx(i);
    },
    [idx]
  );

  if (!images.length) {
    return <View style={[styles.empty, { height }]} />;
  }

  return (
    <View style={{ height, backgroundColor: colors.surfaceSecondary }}>
      <FlatList
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(u, i) => `${u}-${i}`}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={{ width, height }} contentFit="cover" transition={200} />
        )}
      />
      {images.length > 1 && (
        <View style={styles.dots}>
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, idx === i && styles.dotActive]} />
          ))}
        </View>
      )}
      {images.length > 1 && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {idx + 1} / {images.length}
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  empty: { backgroundColor: colors.surfaceSecondary },
  dots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.55)" },
  dotActive: { backgroundColor: colors.surface, width: 18 },
  counter: {
    position: "absolute",
    right: 14,
    top: 14,
    backgroundColor: "rgba(10,10,10,0.65)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  counterText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
});
