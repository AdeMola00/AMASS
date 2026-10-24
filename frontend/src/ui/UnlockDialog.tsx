import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, ApiError, FeatureKey, UnlockQuote, UnlockResult } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText } from "./Text";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import { Skeleton } from "./Feedback";
import { TokenIcon } from "@/src/components/TokenIcon";

/**
 * The ONE paid-action confirmation for MASS (properties) and FIX (FIXA providers).
 *
 * Rules enforced here (the backend enforces them again):
 *  • Live values only — a fresh quote is fetched every time the sheet opens.
 *  • Shows item, fee (tokens + naira), balance, balance after and the deduction line.
 *  • Nothing is charged until "Confirm & View"; Confirm is disabled after the first tap.
 *  • Cancellations are logged server-side; insufficient balance never charges.
 *  • Idempotency key per attempt — a retry after an unknown outcome is free.
 */
export function UnlockDialog({
  visible,
  featureKey,
  targetId,
  onClose,
  onUnlocked,
  testID = "unlock-dialog",
  children,
}: {
  visible: boolean;
  featureKey: FeatureKey;
  targetId: string | null;
  onClose: () => void;
  onUnlocked: (result: UnlockResult) => void;
  testID?: string;
  /** Optional context rendered under the header (e.g. a friends-saved nudge). Never alters the fee. */
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { refresh } = useWallet();
  const [quote, setQuote] = useState<UnlockQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const keyRef = useRef<string | null>(null);
  const settledRef = useRef(false);

  const isMass = featureKey === "property";
  const currency = isMass ? "MASS" : "FIX";
  const accentText = isMass ? colors.massText : colors.fixText;
  const accentSoft = isMass ? colors.massSoft : colors.fixSoft;

  const loadQuote = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    setError(null);
    try {
      const q = await api.unlockQuote(featureKey, targetId);
      setQuote(q);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load the price. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [featureKey, targetId]);

  useEffect(() => {
    if (visible) {
      settledRef.current = false;
      keyRef.current = `${featureKey}:${targetId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
      setQuote(null);
      setConfirming(false);
      loadQuote();
    }
  }, [visible, loadQuote, featureKey, targetId]);

  // Already unlocked / owner → open straight away, no dialog friction.
  useEffect(() => {
    if (!visible || !quote || settledRef.current) return;
    if (quote.already_unlocked || quote.is_owner) {
      settledRef.current = true;
      confirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, visible]);

  const cancel = () => {
    if (!settledRef.current && targetId && quote && !quote.already_unlocked && !quote.is_owner) {
      api.unlockCancel(featureKey, targetId, "user_cancelled").catch(() => {});
    }
    onClose();
  };

  const confirm = async () => {
    if (!targetId || confirming) return;
    setConfirming(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const key = keyRef.current!;
    try {
      const res = await api.unlock(featureKey, targetId, key);
      settledRef.current = true;
      await refresh().catch(() => {});
      if (res.charged > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onUnlocked(res);
    } catch (e: any) {
      // Unknown outcome (timeout / network) → resolve status before letting the user retry.
      if (!(e instanceof ApiError)) {
        try {
          const st = await api.unlockStatus(key);
          if (st.status === "completed" && st.result) {
            settledRef.current = true;
            await refresh().catch(() => {});
            onUnlocked(st.result);
            return;
          }
        } catch {}
      }
      const detail = e?.detail;
      if (e instanceof ApiError && e.status === 402) {
        setError(`Not enough ${currency}. ${typeof detail === "string" ? detail : ""}`.trim());
        loadQuote();
      } else if (e instanceof ApiError && e.status === 409) {
        setError(e.message || "This unlock is still being processed — please wait a moment.");
      } else {
        setError(e?.message ?? "Something went wrong. You were not charged.");
      }
      setConfirming(false);
    }
  };

  const fund = () => {
    onClose();
    setTimeout(() => router.push({ pathname: "/buy-tokens", params: { currency, returnTo: isMass ? `/property/${targetId}` : `/fixa/${targetId}`, unlock: "1" } } as any), 150);
  };

  const canAfford = !!quote && quote.can_afford;
  const fmt = (n: number) => n.toLocaleString();

  return (
    <Sheet visible={visible} onClose={cancel} testID={testID}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: accentSoft }]}>
          {isMass ? <TokenIcon size={30} /> : <Ionicons name="construct" size={24} color={accentText} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heroSm">{isMass ? "Unlock this home" : "Unlock this provider"}</AppText>
          <AppText variant="bodySm" tone="secondary" numberOfLines={2} testID="unlock-item-label">
            {loading || !quote ? "Checking the live price…" : quote.label}
          </AppText>
        </View>
      </View>

      {children}

      {loading || !quote ? (
        <View style={{ gap: 10, marginTop: space[3] }}>
          <Skeleton height={56} radius={14} />
          <Skeleton height={56} radius={14} />
          <Skeleton height={52} radius={radii.pill} />
        </View>
      ) : (
        <>
          <View style={[styles.ledger, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="summary">
            {/* Exact fee — tokens AND naira carry equal weight; the rate makes the conversion auditable. */}
            <View style={styles.feeBlock} testID="unlock-fee-block">
              <AppText variant="bodySm" tone="secondary" weight="medium">
                Fee
              </AppText>
              <View style={styles.feeAmounts}>
                <AppText variant="h2" color={accentText} tabular testID="unlock-fee">
                  {fmt(quote.fee)} {currency}
                </AppText>
                <AppText variant="h3" tabular testID="unlock-fee-ngn">
                  = ₦{fmt(quote.fee_ngn)}
                </AppText>
              </View>
              <AppText variant="micro" tone="tertiary" tabular testID="unlock-rate">
                ₦{fmt(quote.token_ngn)} = 1 {currency}
                {isMass ? ` · Zone ${quote.zone_tier} · ${quote.category === "sale" ? "Sale" : "Rent"}` : ""}
              </AppText>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Row label="Your balance" value={`${fmt(quote.balance)} ${currency}`} sub={`= ₦${fmt(quote.balance * quote.token_ngn)}`} testID="unlock-balance" />
            {canAfford ? (
              <Row label="Balance after" value={`${fmt(quote.balance_after)} ${currency}`} sub={`= ₦${fmt(quote.balance_after * quote.token_ngn)}`} strong testID="unlock-balance-after" />
            ) : (
              <Row
                label="Short by"
                value={`${fmt(quote.fee - quote.balance)} ${currency}`}
                sub={`= ₦${fmt((quote.fee - quote.balance) * quote.token_ngn)} · nothing charged`}
                strong
                color={colors.error}
                testID="unlock-balance-after"
              />
            )}
          </View>

          {canAfford ? (
            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textTertiary} />
              <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                Confirming deducts {fmt(quote.fee)} {currency} (₦{fmt(quote.fee_ngn)}) from your wallet. One-time — this {isMass ? "property" : "provider"} stays unlocked forever. Cancel costs nothing.
              </AppText>
            </View>
          ) : (
            <View style={[styles.noteRow, { backgroundColor: colors.warningSoft, borderRadius: radii.sm, padding: 10 }]} accessibilityRole="alert">
              <Ionicons name="wallet-outline" size={15} color={colors.warning} />
              <AppText variant="caption" style={{ flex: 1 }}>
                You need {fmt(quote.fee)} {currency} (₦{fmt(quote.fee_ngn)}). Nothing has been charged and nothing is unlocked.
              </AppText>
            </View>
          )}

          {error ? (
            <AppText variant="caption" tone="error" style={{ marginTop: 8 }} accessibilityRole="alert" testID="unlock-error">
              {error}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" size="lg" onPress={cancel} style={{ flex: 1 }} testID="unlock-cancel" />
            {canAfford ? (
              <Button
                label={confirming ? "Unlocking…" : "Confirm & View"}
                variant="premium"
                size="lg"
                onPress={confirm}
                disabled={confirming}
                loading={confirming}
                style={{ flex: 1.5 }}
                testID="unlock-confirm"
              />
            ) : (
              <Button label={`Get ${currency}`} variant="premium" size="lg" iconLeft="add-circle" onPress={fund} style={{ flex: 1.4 }} testID="unlock-fund" />
            )}
          </View>
        </>
      )}
      {confirming && Platform.OS === "web" ? <ActivityIndicator style={{ position: "absolute", top: 12, right: 16 }} color={colors.textTertiary} /> : null}
    </Sheet>
  );
}

function Row({ label, value, sub, strong, color, testID }: { label: string; value: string; sub?: string; strong?: boolean; color?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <AppText variant="bodySm" tone="secondary" weight="medium">
        {label}
      </AppText>
      <View style={{ alignItems: "flex-end" }}>
        <AppText variant={strong ? "title" : "bodyMedium"} weight={strong ? "bold" : "medium"} color={color ?? colors.text} tabular testID={testID}>
          {value}
        </AppText>
        {sub ? (
          <AppText variant="micro" tone="tertiary" tabular>
            {sub}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: space[3] },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  ledger: { borderRadius: radii.md, padding: space[3], gap: 12 },
  feeBlock: { gap: 4 },
  feeAmounts: { flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 },
  divider: { height: StyleSheet.hairlineWidth },
  noteRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: space[3] },
  actions: { flexDirection: "row", gap: 10, marginTop: space[4] },
});
