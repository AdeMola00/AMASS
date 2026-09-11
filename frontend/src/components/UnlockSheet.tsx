import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing, formatNaira } from "@/src/constants/theme";
import { TokenIcon } from "@/src/components/TokenIcon";
import { useWallet } from "@/src/contexts/wallet";

export type UnlockSheetRef = {
  open: (opts: { propertyId: string; propertyTitle: string; tokenCost: number }) => void;
  close: () => void;
};

export const UnlockSheet = forwardRef<
  UnlockSheetRef,
  { onSuccess?: () => void }
>(({ onSuccess }, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const router = useRouter();
  const { wallet, unlockProperty } = useWallet();

  const [propertyId, setPropertyId] = useState<string>("");
  const [propertyTitle, setPropertyTitle] = useState<string>("");
  const [tokenCost, setTokenCost] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    open: ({ propertyId: pid, propertyTitle: pt, tokenCost: tc }) => {
      setPropertyId(pid);
      setPropertyTitle(pt);
      setTokenCost(tc);
      setError(null);
      sheetRef.current?.present();
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["58%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
      />
    ),
    []
  );

  const balance = wallet?.spendable ?? 0;
  const canAfford = balance >= tokenCost;
  const shortfall = Math.max(0, tokenCost - balance);

  const handleUnlock = async () => {
    if (!canAfford) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setProcessing(true);
    setError(null);
    try {
      await unlockProperty(propertyId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      sheetRef.current?.dismiss();
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message ?? "Could not unlock this property. Try again.");
    } finally {
      setProcessing(false);
    }
  };

  const goto = (path: string) => {
    sheetRef.current?.dismiss();
    setTimeout(() => router.push(path as any), 200);
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      enableDynamicSizing={false}
    >
      <BottomSheetView style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <TokenIcon size={44} animated />
          </View>
        </View>

        <Text style={styles.title}>Unlock this property</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {propertyTitle}
        </Text>

        <View style={styles.costBlock}>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>This property requires</Text>
            <View style={styles.costPill}>
              <TokenIcon size={16} />
              <Text style={styles.costPillText}>{tokenCost} tokens</Text>
            </View>
          </View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>You currently have</Text>
            <View style={[styles.costPill, { backgroundColor: colors.surfaceSecondary }]}>
              <TokenIcon size={16} />
              <Text style={[styles.costPillText, { color: colors.text }]}>
                {balance} tokens
              </Text>
            </View>
          </View>
        </View>

        {!canAfford && (
          <View style={styles.shortfallCard}>
            <Ionicons name="alert-circle" size={16} color={colors.red} />
            <Text style={styles.shortfallText}>
              You are only{" "}
              <Text style={styles.shortfallBold}>{shortfall} tokens</Text> away from
              unlocking this property.
            </Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          {canAfford ? (
            <Pressable
              style={[styles.primaryBtn, processing && { opacity: 0.7 }]}
              onPress={handleUnlock}
              disabled={processing}
              testID="unlock-confirm-btn"
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <TokenIcon size={18} tone="white" />
                  <Text style={styles.primaryText}>
                    Unlock for {tokenCost} tokens
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => goto("/buy-tokens")}
              testID="buy-tokens-cta"
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.primaryText}>Buy tokens</Text>
            </Pressable>
          )}
          <View style={styles.secondaryRow}>
            <Pressable style={styles.secondaryBtn} onPress={() => goto("/subscribe")}>
              <Ionicons name="star" size={14} color={colors.text} />
              <Text style={styles.secondaryText}>Subscribe</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => goto("/wallet")}>
              <Ionicons name="wallet-outline" size={14} color={colors.text} />
              <Text style={styles.secondaryText}>Earn tokens</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.footnote}>
          Once unlocked, this property stays open in your library — forever.
        </Text>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

UnlockSheet.displayName = "UnlockSheet";

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  handle: { backgroundColor: colors.borderStrong, width: 40 },
  container: { flex: 1, padding: spacing.xl },
  headerRow: { alignItems: "center", marginBottom: spacing.md },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#FFF7DB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F5B301",
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: -0.5 },
  subtitle: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  costBlock: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FAFAFA",
    gap: 10,
  },
  costRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  costLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  costPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFF7DB",
    borderWidth: 1,
    borderColor: "#F5B301",
  },
  costPillText: { fontSize: 13, fontWeight: "800", color: "#7A5B00" },
  shortfallCard: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    marginTop: spacing.md,
    alignItems: "flex-start",
  },
  shortfallText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 17 },
  shortfallBold: { fontWeight: "800", color: colors.red },
  error: { color: colors.red, fontSize: 12, marginTop: 8 },
  actions: { marginTop: spacing.lg, gap: 10 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  secondaryRow: { flexDirection: "row", gap: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  secondaryText: { fontSize: 13, fontWeight: "800", color: colors.text },
  footnote: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: spacing.md,
    lineHeight: 15,
  },
});
