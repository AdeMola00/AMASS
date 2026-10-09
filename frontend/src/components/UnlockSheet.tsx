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
  open: (opts: {
    propertyId: string;
    propertyTitle: string;
    tokenCost: number;
    mode?: "access" | "agent";
  }) => void;
  close: () => void;
};

export const UnlockSheet = forwardRef<
  UnlockSheetRef,
  { onSuccess?: () => void }
>(({ onSuccess }, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const router = useRouter();
  const { wallet, accessProperty, revealAgent } = useWallet();

  const [propertyId, setPropertyId] = useState<string>("");
  const [propertyTitle, setPropertyTitle] = useState<string>("");
  const [tokenCost, setTokenCost] = useState(0);
  const [mode, setMode] = useState<"access" | "agent">("access");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    open: ({ propertyId: pid, propertyTitle: pt, tokenCost: tc, mode: m }) => {
      setPropertyId(pid);
      setPropertyTitle(pt);
      setTokenCost(tc);
      setMode(m ?? "access");
      setError(null);
      sheetRef.current?.present();
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["62%"], []);

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

  const isAgent = mode === "agent";
  const balance = wallet?.spendable ?? 0;
  const canAfford = balance >= tokenCost;
  const shortfall = Math.max(0, tokenCost - balance);

  const handleUnlock = async () => {
    if (!canAfford) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setProcessing(true);
    setError(null);
    try {
      if (isAgent) {
        await revealAgent(propertyId);
      } else {
        await accessProperty(propertyId);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      sheetRef.current?.dismiss();
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const goto = (path: string) => {
    sheetRef.current?.dismiss();
    setTimeout(() => router.push(path as any), 200);
  };

  // Top up and come straight back to this property + tier to finish unlocking.
  const gotoTopUp = () => {
    sheetRef.current?.dismiss();
    setTimeout(
      () =>
        router.push({
          pathname: "/buy-tokens",
          params: { returnTo: `/property/${propertyId}`, unlock: mode },
        } as any),
      200
    );
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
            {isAgent ? (
              <Ionicons name="call" size={30} color="#7A5B00" />
            ) : (
              <TokenIcon size={44} animated />
            )}
          </View>
        </View>

        <Text style={styles.title}>
          {isAgent ? "Reveal agent contact" : "Unlock property details"}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {propertyTitle}
        </Text>

        <View style={styles.whatBlock}>
          <Text style={styles.whatTitle}>
            {isAgent ? "This reveals" : "This unlocks"}
          </Text>
          {(isAgent
            ? ["Agent's direct phone number", "Agent's email address"]
            : ["Exact address & map pin", "All property photos", "Full specs, amenities & AI insights"]
          ).map((line) => (
            <View key={line} style={styles.whatRow}>
              <Ionicons name="checkmark-circle" size={15} color={colors.emerald} />
              <Text style={styles.whatText}>{line}</Text>
            </View>
          ))}
        </View>

        <View style={styles.costBlock}>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>
              {isAgent ? "Agent contact fee" : "Access fee"}
            </Text>
            <View style={styles.costPill}>
              <TokenIcon size={16} />
              <Text style={styles.costPillText}>{tokenCost} MASS</Text>
            </View>
          </View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>You currently have</Text>
            <View style={[styles.costPill, { backgroundColor: colors.surfaceSecondary }]}>
              <TokenIcon size={16} />
              <Text style={[styles.costPillText, { color: colors.text }]}>
                {balance} MASS
              </Text>
            </View>
          </View>
        </View>

        {!canAfford && (
          <View style={styles.shortfallCard}>
            <Ionicons name="alert-circle" size={16} color={colors.red} />
            <Text style={styles.shortfallText}>
              You need{" "}
              <Text style={styles.shortfallBold}>{shortfall} more MASS</Text> to continue.
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
                    {isAgent ? `Reveal for ${tokenCost} MASS` : `Unlock for ${tokenCost} MASS`}
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={styles.primaryBtn}
              onPress={gotoTopUp}
              testID="buy-tokens-cta"
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.primaryText}>Top up & continue</Text>
            </Pressable>
          )}
          <View style={styles.secondaryRow}>
            <Pressable style={styles.secondaryBtn} onPress={() => goto("/subscribe")}>
              <Ionicons name="star" size={14} color={colors.text} />
              <Text style={styles.secondaryText}>Subscribe</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => goto("/wallet")}>
              <Ionicons name="wallet-outline" size={14} color={colors.text} />
              <Text style={styles.secondaryText}>Earn MASS</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.footnote}>
          {isAgent
            ? "You're only charged if the contact is delivered — otherwise your MASS is refunded automatically."
            : "Pay once — this property stays unlocked in your library."}
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
  whatBlock: {
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    marginBottom: spacing.md,
  },
  whatTitle: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  whatRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  whatText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600" },
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
