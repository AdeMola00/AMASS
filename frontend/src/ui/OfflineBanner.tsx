import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { motion } from "@/src/theme/tokens";
import { AppText } from "./Text";

/**
 * Global connectivity banner. Slides in from the top when the device loses
 * internet access and announces reconnection briefly. Never blocks the UI —
 * screens keep rendering cached data and their own retry affordances.
 */
export function OfflineBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  const [justBack, setJustBack] = useState(false);
  const wasOffline = useRef(false);
  const y = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    const apply = (isOff: boolean) => {
      setOffline(isOff);
      if (!isOff && wasOffline.current) {
        setJustBack(true);
        setTimeout(() => setJustBack(false), 2500);
      }
      wasOffline.current = isOff;
    };
    const unsub = NetInfo.addEventListener((state) => {
      // On web `isInternetReachable` can be null — fall back to isConnected.
      const reachable = state.isInternetReachable ?? state.isConnected;
      apply(state.isConnected === false || reachable === false);
    });
    // Browsers with navigator.connection only emit "change" for connection-type
    // changes, so also watch the plain online/offline events on web.
    let offWeb: (() => void) | undefined;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const on = () => apply(false);
      const off = () => apply(true);
      window.addEventListener("online", on);
      window.addEventListener("offline", off);
      offWeb = () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", off);
      };
    }
    return () => {
      unsub();
      offWeb?.();
    };
  }, []);

  const visible = offline || justBack;
  useEffect(() => {
    Animated.timing(y, {
      toValue: visible ? 0 : -80,
      duration: motion.base,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [visible, y]);

  const bg = offline ? colors.surfaceInverse : colors.success;
  const fg = offline ? colors.textInverse : "#fff";

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { paddingTop: insets.top + 6, backgroundColor: bg, transform: [{ translateY: y }] }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID={offline ? "offline-banner" : justBack ? "online-banner" : undefined}
    >
      <View style={styles.row}>
        <Ionicons name={offline ? "cloud-offline-outline" : "checkmark-circle"} size={15} color={fg} />
        <AppText variant="caption" weight="semibold" color={fg}>
          {offline ? "You're offline — showing what we have saved" : "Back online"}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    paddingBottom: 8,
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
