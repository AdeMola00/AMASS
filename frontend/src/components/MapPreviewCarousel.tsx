import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  Platform,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { PropertyCard } from "@/src/components/PropertyCard";
import { colors, shadows } from "@/src/constants/theme";
import type { Property } from "@/src/lib/api";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;
const CARD_GAP = 12;
const SNAP = CARD_WIDTH + CARD_GAP;
const HIDDEN_Y = 480;
const DISMISS_THRESHOLD = 90;

type Props = {
  properties: Property[];
  activeId: string | null;
  favorites: Set<string>;
  bottomOffset: number;
  onIndexChange: (property: Property) => void;
  onPressCard: (property: Property) => void;
  onFavorite: (id: string) => void;
  onDismiss: () => void;
};

export function MapPreviewCarousel(props: Props) {
  const {
    properties,
    activeId,
    favorites,
    bottomOffset,
    onIndexChange,
    onPressCard,
    onFavorite,
    onDismiss,
  } = props;

  const listRef = useRef<FlatList<Property>>(null);
  const translateY = useSharedValue(HIDDEN_Y);
  const dragOffset = useSharedValue(0);

  const activeIndex = useMemo(
    () => Math.max(0, properties.findIndex((p) => p.id === activeId)),
    [properties, activeId]
  );

  // Animate open/close based on activeId
  useEffect(() => {
    if (activeId) {
      translateY.value = withTiming(0, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
      });
      // scroll list to active card
      const t = setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({
            index: Math.max(0, activeIndex),
            animated: true,
          });
        } catch {
          // ignore
        }
      }, 60);
      return () => clearTimeout(t);
    } else {
      translateY.value = withTiming(HIDDEN_Y, {
        duration: 240,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [activeId, activeIndex, translateY]);

  const dismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onDismiss();
  }, [onDismiss]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-20, 20])
        .onStart(() => {
          dragOffset.value = translateY.value;
        })
        .onUpdate((e) => {
          const next = dragOffset.value + e.translationY;
          translateY.value = next < 0 ? next * 0.15 : next;
        })
        .onEnd((e) => {
          if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 800) {
            translateY.value = withTiming(HIDDEN_Y, {
              duration: 220,
              easing: Easing.in(Easing.cubic),
            });
            runOnJS(dismiss)();
          } else {
            translateY.value = withTiming(0, {
              duration: 220,
              easing: Easing.out(Easing.cubic),
            });
          }
        }),
    [translateY, dragOffset, dismiss]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const notifyIndex = useCallback(
    (idx: number) => {
      const p = properties[idx];
      if (p && p.id !== activeId) {
        Haptics.selectionAsync().catch(() => {});
        onIndexChange(p);
      }
    },
    [properties, activeId, onIndexChange]
  );

  const onMomentumScrollEnd = useCallback(
    (e: any) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
      notifyIndex(idx);
    },
    [notifyIndex]
  );

  if (properties.length === 0) return null;

  const pagerLabel =
    properties.length > 1 ? `${activeIndex + 1} / ${properties.length}` : "";

  const containerStyle = [
    styles.wrap,
    { bottom: bottomOffset },
    animatedStyle,
  ];

  const list = (
    <FlatList
      ref={listRef}
      data={properties}
      keyExtractor={(p) => p.id}
      horizontal
      pagingEnabled={false}
      snapToInterval={SNAP}
      snapToAlignment="start"
      decelerationRate="fast"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      onMomentumScrollEnd={onMomentumScrollEnd}
      initialScrollIndex={activeIndex >= 0 ? activeIndex : 0}
      getItemLayout={(_, index) => ({
        length: SNAP,
        offset: SNAP * index,
        index,
      })}
      onScrollToIndexFailed={({ index }) => {
        setTimeout(() => {
          try {
            listRef.current?.scrollToOffset({
              offset: index * SNAP,
              animated: false,
            });
          } catch {
            // ignore
          }
        }, 50);
      }}
      renderItem={({ item }) => (
        <View style={{ width: CARD_WIDTH, marginRight: CARD_GAP }}>
          <PropertyCard
            property={item}
            variant="floating"
            onPress={() => onPressCard(item)}
            onFavorite={() => onFavorite(item.id)}
            favorited={favorites.has(item.id)}
          />
        </View>
      )}
    />
  );

  const handleAndClose = (
    <View style={styles.handleWrap}>
      <View style={styles.handle} />
      {pagerLabel !== "" ? (
        <View style={styles.pager}>
          <Text style={styles.pagerText}>{pagerLabel}</Text>
        </View>
      ) : null}
      <Pressable
        onPress={dismiss}
        style={styles.closeBtn}
        hitSlop={12}
        testID="carousel-close"
      >
        <Ionicons name="close" size={14} color={colors.text} />
      </Pressable>
    </View>
  );

  // On web, gesture-handler pan can be finicky with FlatList horizontal scrolling.
  // Keep the drag-to-dismiss on the drag handle only for web; native gets the whole surface.
  if (Platform.OS === "web") {
    return (
      <Animated.View style={containerStyle} pointerEvents="box-none">
        <GestureDetector gesture={panGesture}>
          <Animated.View>{handleAndClose}</Animated.View>
        </GestureDetector>
        {list}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={containerStyle} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Animated.View>{handleAndClose}</Animated.View>
      </GestureDetector>
      {list}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 10,
    position: "relative",
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  closeBtn: {
    position: "absolute",
    right: 20,
    top: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.98)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  pager: {
    position: "absolute",
    left: 20,
    top: 2,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(10,10,10,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  pagerText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
});
