import React, { useEffect } from "react";
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { motion, radii, space } from "@/src/theme/tokens";
import { AppText } from "./Text";
import { Button } from "./Button";

import type { IconName } from "./icons";

/* ─── Sheet: spring-in bottom sheet (Modal-based, web-safe) ─────────── */
export function Sheet({
  visible,
  onClose,
  children,
  title,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  testID?: string;
}) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const y = useSharedValue(height);
  const o = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      y.value = withSpring(0, motion.springSoft);
      o.value = withTiming(1, { duration: motion.base });
    } else {
      y.value = withTiming(height, { duration: motion.base });
      o.value = withTiming(0, { duration: motion.base });
    }
  }, [visible, height, y, o]);
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const back = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalRoot} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, back]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.bgElevated, paddingBottom: Math.max(insets.bottom, 16) + 8 },
            shadows.lg,
            sheet,
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          {title ? (
            <View style={styles.sheetHead}>
              <AppText variant="h3">{title}</AppText>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ─── ChargeConfirm: transparent paid-action confirmation ───────────── */
export function ChargeConfirm({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  cost,
  currency = "MASS",
  balance,
  confirmLabel,
  loading,
  error,
  onTopUp,
  icon = "lock-open",
  testID = "charge-confirm",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  cost: number;
  currency?: "MASS" | "FIX";
  balance: number;
  confirmLabel?: string;
  loading?: boolean;
  error?: string | null;
  onTopUp?: () => void;
  icon?: IconName;
  testID?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const after = balance - cost;
  const canAfford = after >= 0;
  const isMass = currency === "MASS";
  const accent = isMass ? colors.mass : colors.fix;
  const accentText = isMass ? colors.massText : colors.fixText;
  const accentSoft = isMass ? colors.massSoft : colors.fixSoft;
  return (
    <Sheet visible={visible} onClose={onClose} testID={testID}>
      <View style={styles.chargeHead}>
        <View style={[styles.chargeIcon, { backgroundColor: accentSoft }]}>
          <Ionicons name={icon} size={24} color={accentText} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="h3">{title}</AppText>
          {description ? (
            <AppText variant="bodySm" tone="secondary">
              {description}
            </AppText>
          ) : null}
        </View>
      </View>

      {children}

      <View style={[styles.ledger, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <LedgerRow label="Cost" value={`${cost.toLocaleString()} ${currency}`} strong color={accentText} />
        <LedgerRow label="Your balance now" value={`${balance.toLocaleString()} ${currency}`} />
        <View style={[styles.ledgerDivider, { backgroundColor: colors.border }]} />
        <LedgerRow
          label="Balance after"
          value={`${Math.max(after, 0).toLocaleString()} ${currency}`}
          strong
          color={canAfford ? colors.text : colors.error}
          testID="charge-balance-after"
        />
      </View>

      {!canAfford ? (
        <View style={[styles.notice, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <AppText variant="bodySm" color={colors.error} style={{ flex: 1 }}>
            You need {Math.abs(after).toLocaleString()} more {currency} to continue. No charge has been made.
          </AppText>
        </View>
      ) : (
        <View style={[styles.notice, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="shield-checkmark" size={16} color={colors.success} />
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
            You&apos;ll only be charged once you confirm. Charges are recorded in your wallet history.
          </AppText>
        </View>
      )}

      {error ? (
        <AppText variant="caption" tone="error" style={{ marginTop: 8 }} testID="charge-error">
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        {canAfford ? (
          <Button
            label={confirmLabel ?? `Confirm · ${cost.toLocaleString()} ${currency}`}
            variant={isMass ? "primary" : "fix"}
            size="lg"
            fullWidth
            loading={loading}
            onPress={onConfirm}
            iconLeft={icon}
            testID="charge-confirm-btn"
          />
        ) : onTopUp ? (
          <Button label={`Top up ${currency}`} variant={isMass ? "mass" : "fix"} size="lg" fullWidth onPress={onTopUp} iconLeft="add" testID="charge-topup-btn" />
        ) : null}
        <Button label="Not now" variant="ghost" size="md" fullWidth onPress={onClose} testID="charge-cancel-btn" />
      </View>
      <View style={{ height: 2, backgroundColor: accent, opacity: 0, width: 1 }} />
    </Sheet>
  );
}

function LedgerRow({ label, value, strong, color, testID }: { label: string; value: string; strong?: boolean; color?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.ledgerRow}>
      <AppText variant="bodySm" tone="secondary">
        {label}
      </AppText>
      <AppText variant={strong ? "title" : "bodyMedium"} tabular color={color ?? colors.text} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: space[5],
    paddingTop: 10,
    maxHeight: "92%",
    ...(Platform.OS === "web" ? { maxWidth: 640, width: "100%", alignSelf: "center" } : null),
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 14 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  chargeHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  chargeIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  ledger: { borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  ledgerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ledgerDivider: { height: StyleSheet.hairlineWidth },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm, marginTop: 12 },
  actions: { gap: 8, marginTop: 16 },
});
