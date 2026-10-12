import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IconName } from "../ui/icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { radius, spacing } from "@/src/constants/theme";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";
import { useToast } from "@/src/ui";

const { height } = Dimensions.get("window");
const SKIP_AFTER_MS = 3000;

/**
 * AMASS full-screen sponsored ad modal.
 *  - Skip button appears after 3s
 *  - Sponsored label + close button always visible
 *  - Overflow menu: "Not interested" / "Hide similar" / "Report"
 *  - CTA opens the associated marketplace item / property
 */
export function AdModal({
  ad,
  visible,
  onClose,
  context = "marketplace_home",
}: {
  ad: any | null;
  visible: boolean;
  onClose: () => void;
  context?: string;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const toast = useToast();

  const router = useRouter();
  const [skipReady, setSkipReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(30)).current;
  const trackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (visible && ad?.id) {
      // Track impression once per open
      if (trackedRef.current !== ad.id) {
        trackedRef.current = ad.id;
        api.trackAd(ad.id, "impression", context).catch(() => {});
      }
      setSkipReady(false);
      setMenuOpen(false);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(rise, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
      const t = setTimeout(() => setSkipReady(true), SKIP_AFTER_MS);
      return () => clearTimeout(t);
    } else {
      trackedRef.current = null;
      fade.setValue(0);
      rise.setValue(30);
    }
  }, [visible, ad, context, fade, rise]);

  if (!ad) return null;

  const image = ad.media?.[0];

  const dismiss = (reason: string) => {
    api.trackAd(ad.id, "dismiss", reason).catch(() => {});
    onClose();
  };

  const cta = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await api.trackAd(ad.id, "click", context);
    } catch {}
    onClose();
    // Route to underlying item
    setTimeout(() => {
      if (ad.marketplace_item_id) {
        router.push(`/marketplace/${ad.marketplace_item_id}` as any);
      } else if (ad.property_id) {
        router.push(`/property/${ad.property_id}` as any);
      } else {
        router.push("/(tabs)/marketplace" as any);
      }
    }, 200);
  };

  const feedback = async (event: "not_interested" | "hide_similar" | "report") => {
    setMenuOpen(false);
    try {
      await api.trackAd(ad.id, event, context);
    } catch {}
    toast.success(
      event === "report" ? "Thanks for reporting" : "Got it",
      event === "report" ? "We'll review this ad within 24 hours." : "You'll see fewer ads like this."
    );
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <Animated.View style={[styles.card, { opacity: fade, transform: [{ translateY: rise }] }]}>
          {/* Media */}
          <View style={styles.mediaWrap}>
            {image ? (
              <Image
                source={{ uri: image.url }}
                style={styles.media}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <View style={[styles.media, { backgroundColor: colors.surfaceSecondary }]} />
            )}
            <LinearGradient
              colors={["rgba(0,0,0,0.7)", "transparent", "transparent", "rgba(0,0,0,0.85)"]}
              locations={[0, 0.25, 0.55, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Sponsored label */}
            <View style={styles.sponsoredRow}>
              <View style={styles.sponsoredBadge}>
                <Ionicons name="megaphone" size={10} color="#fff" />
                <Text style={styles.sponsoredText}>Sponsored</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => setMenuOpen((v) => !v)}
                  style={styles.iconBtn}
                  testID="ad-more"
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={skipReady ? onClose : undefined}
                  style={[styles.iconBtn, !skipReady && { opacity: 0.4 }]}
                  disabled={!skipReady}
                  testID="ad-close"
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
              </View>
            </View>

            {/* Menu overlay */}
            {menuOpen && (
              <View style={styles.menu}>
                <MenuItem icon="thumbs-down-outline" label="Not interested" onPress={() => feedback("not_interested")} />
                <MenuItem icon="eye-off-outline" label="Hide similar ads" onPress={() => feedback("hide_similar")} />
                <MenuItem icon="flag-outline" label="Report ad" tone="red" onPress={() => feedback("report")} />
              </View>
            )}

            {/* Skip countdown pill */}
            {!skipReady && (
              <View style={styles.skipPill}>
                <Ionicons name="timer-outline" size={12} color="#fff" />
                <Text style={styles.skipText}>Skip in {Math.ceil(SKIP_AFTER_MS / 1000)}s</Text>
              </View>
            )}

            {/* Bottom text */}
            <View style={styles.bottomText}>
              <Text style={styles.title} numberOfLines={2}>
                {ad.title}
              </Text>
              <Text style={styles.body} numberOfLines={3}>
                {ad.description}
              </Text>
            </View>
          </View>

          {/* CTA row */}
          <View style={styles.ctaRow}>
            <Pressable style={styles.ctaSecondary} onPress={() => dismiss("skip")} testID="ad-skip">
              <Text style={styles.ctaSecondaryText}>
                {skipReady ? "Skip" : "…"}
              </Text>
            </Pressable>
            <Pressable style={styles.ctaPrimary} onPress={cta} testID="ad-cta">
              <Text style={styles.ctaPrimaryText}>{ad.cta_label || "Shop now"}</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: "red";
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const color = tone === "red" ? colors.red : colors.text;
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.menuText, tone === "red" && { color: colors.red }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
  },
  mediaWrap: { position: "relative", height: Math.min(height * 0.62, 540) },
  media: { width: "100%", height: "100%" },
  sponsoredRow: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sponsoredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  sponsoredText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    position: "absolute",
    top: 60,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuText: { fontSize: 13, fontWeight: "700", color: colors.text },
  skipPill: {
    position: "absolute",
    top: 68,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  skipText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  bottomText: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 20,
    gap: 6,
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  body: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 18 },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    backgroundColor: "#0A0A0A",
  },
  ctaSecondary: {
    paddingHorizontal: 16,
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaSecondaryText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 13 },
  ctaPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  ctaPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: -0.2 },
});
