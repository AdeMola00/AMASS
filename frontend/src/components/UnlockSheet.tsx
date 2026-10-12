import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button } from "@/src/ui";
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
  const { colors } = useTheme();
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

  const snapPoints = useMemo(() => ["66%"], []);

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

  const lines = isAgent
    ? ["Agent's direct phone number", "Agent's email address"]
    : ["Exact address & map pin", "All property photos", "Full specs, amenities & AI insights"];

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={[styles.sheetBg, { backgroundColor: colors.bgElevated }]}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong, width: 40 }}
      enableDynamicSizing={false}
    >
      <BottomSheetView style={styles.container}>
        <View style={styles.headerRow}>
          <View style={[styles.iconWrap, { backgroundColor: colors.massSoft, borderColor: colors.mass }]}>
            {isAgent ? <Ionicons name="call" size={30} color={colors.massText} /> : <TokenIcon size={44} animated />}
          </View>
        </View>

        <AppText variant="h2" align="center">
          {isAgent ? "Reveal agent contact" : "Unlock property details"}
        </AppText>
        <AppText variant="bodySm" tone="tertiary" align="center" numberOfLines={2} style={{ marginTop: 4, marginBottom: space[4] }}>
          {propertyTitle}
        </AppText>

        <View style={[styles.block, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <AppText variant="label" tone="secondary" uppercase>
            {isAgent ? "This reveals" : "This unlocks"}
          </AppText>
          {lines.map((line) => (
            <View key={line} style={styles.row}>
              <Ionicons name="checkmark-circle" size={15} color={colors.success} />
              <AppText variant="bodySm" weight="medium" style={{ flex: 1 }}>
                {line}
              </AppText>
            </View>
          ))}
        </View>

        <View style={[styles.block, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, marginBottom: 0, gap: 10 }]}>
          <View style={styles.costRow}>
            <AppText variant="bodySm" tone="secondary" weight="medium">
              {isAgent ? "Agent contact fee" : "Access fee"}
            </AppText>
            <View style={[styles.costPill, { backgroundColor: colors.massSoft, borderColor: colors.mass }]}>
              <TokenIcon size={16} />
              <AppText variant="caption" weight="bold" color={colors.massText} tabular>
                {tokenCost} MASS
              </AppText>
            </View>
          </View>
          <View style={styles.costRow}>
            <AppText variant="bodySm" tone="secondary" weight="medium">
              You currently have
            </AppText>
            <View style={[styles.costPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TokenIcon size={16} />
              <AppText variant="caption" weight="bold" tabular>
                {balance} MASS
              </AppText>
            </View>
          </View>
          <View style={[styles.costRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }]}>
            <AppText variant="bodySm" weight="bold">
              Balance after
            </AppText>
            <AppText variant="bodyMedium" weight="bold" color={canAfford ? colors.text : colors.error} tabular testID="unlock-balance-after">
              {Math.max(0, balance - tokenCost)} MASS
            </AppText>
          </View>
        </View>

        {!canAfford && (
          <View style={[styles.shortfallCard, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <AppText variant="caption" style={{ flex: 1 }}>
              You need{" "}
              <AppText variant="caption" weight="bold" tone="error">
                {shortfall} more MASS
              </AppText>{" "}
              to continue.
            </AppText>
          </View>
        )}

        {error && (
          <AppText variant="caption" tone="error" style={{ marginTop: 8 }} accessibilityRole="alert">
            {error}
          </AppText>
        )}

        <View style={styles.actions}>
          {canAfford ? (
            <Button
              label={isAgent ? `Reveal for ${tokenCost} MASS` : `Unlock for ${tokenCost} MASS`}
              variant="brand"
              size="lg"
              fullWidth
              loading={processing}
              onPress={handleUnlock}
              testID="unlock-confirm-btn"
            />
          ) : (
            <Button label="Top up & continue" variant="brand" size="lg" fullWidth iconLeft="add-circle" onPress={gotoTopUp} testID="buy-tokens-cta" />
          )}
          <View style={styles.secondaryRow}>
            <Button label="Subscribe" variant="outline" size="sm" iconLeft="star" onPress={() => goto("/subscribe")} style={{ flex: 1 }} />
            <Button label="Earn MASS" variant="outline" size="sm" iconLeft="wallet-outline" onPress={() => goto("/wallet")} style={{ flex: 1 }} />
          </View>
        </View>

        <AppText variant="micro" tone="tertiary" align="center" style={{ marginTop: space[3] }}>
          {isAgent
            ? "You're only charged if the contact is delivered — otherwise your MASS is refunded automatically."
            : "Pay once — this property stays unlocked in your library."}
        </AppText>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

UnlockSheet.displayName = "UnlockSheet";

const styles = StyleSheet.create({
  sheetBg: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  container: { flex: 1, padding: space[5] },
  headerRow: { alignItems: "center", marginBottom: space[3] },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  block: {
    borderRadius: radii.md,
    padding: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginBottom: space[3],
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  costRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  costPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  shortfallCard: {
    flexDirection: "row",
    gap: 8,
    padding: space[3],
    borderRadius: radii.md,
    marginTop: space[3],
    alignItems: "flex-start",
  },
  actions: { marginTop: space[4], gap: 10 },
  secondaryRow: { flexDirection: "row", gap: 10 },
});
