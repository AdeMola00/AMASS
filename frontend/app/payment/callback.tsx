import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Animated, { FadeIn } from "react-native-reanimated";
import { api } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Button, EmptyState, IconButton, Screen, useCelebrate } from "@/src/ui";

/**
 * Deep-link callback landing screen — providers redirect here after checkout.
 * Displayed while we poll the backend for the paid state (source of truth).
 */
export default function PaymentCallback() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ ref?: string; status?: string }>();
  const { refresh } = useWallet();
  const [state, setState] = useState<"checking" | "success" | "pending" | "failed">("checking");
  const celebrate = useCelebrate();
  const [details, setDetails] = useState<any>(null);

  useEffect(() => {
    // Ensure the in-app browser is dismissed if still open
    WebBrowser.dismissBrowser().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ref = params.ref;
    if (!ref) {
      setState("failed");
      return;
    }
    (async () => {
      for (let i = 0; i < 8; i++) {
        try {
          const s = await api.paymentStatus(ref);
          if (cancelled) return;
          setDetails(s);
          if (s.status === "paid") {
            setState("success");
            celebrate({ title: s.credits ? `+${s.credits} ${s.currency ?? ""}`.trim() : "Paid!", icon: "wallet", tone: s.currency === "FIX" ? "fix" : "mass" });
            await refresh();
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setState("pending");
    })();
    return () => {
      cancelled = true;
    };
  }, [params.ref, refresh]);

  const toWallet = () => router.replace("/wallet");

  return (
    <Screen testID="payment-callback-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <IconButton icon="close" label="Close" onPress={toWallet} testID="payment-close" />
      </View>

      <View style={styles.body}>
        {state === "checking" ? (
          <Animated.View entering={FadeIn.duration(220)} style={styles.center}>
            <ActivityIndicator size="large" color={colors.brand} />
            <AppText variant="h2" align="center" style={{ marginTop: 16 }}>
              Confirming payment…
            </AppText>
            <AppText variant="bodySm" tone="secondary" align="center">
              This usually takes a couple of seconds.
            </AppText>
          </Animated.View>
        ) : state === "success" ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <EmptyState
              variant="success"
              title="Payment successful"
              body={details?.credits ? `+${details.credits} ${details?.currency ?? ""}`.trim() : "Tokens added to your wallet."}
              testID="payment-success"
            />
            <Button label="View wallet" size="lg" fullWidth iconLeft="wallet" iconRight="arrow-forward" onPress={toWallet} style={{ marginHorizontal: space[6] }} />
          </Animated.View>
        ) : state === "pending" ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <EmptyState
              icon="hourglass-outline"
              title="Payment pending"
              body="We're waiting on the payment provider's confirmation. Your balance will update automatically the moment it clears."
              testID="payment-pending"
            />
            <Button label="OK" size="lg" fullWidth onPress={toWallet} style={{ marginHorizontal: space[6] }} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(220)}>
            <EmptyState variant="error" title="Payment failed" body="We couldn't confirm your payment. No charge has been made — please try again." testID="payment-failed" />
            <Button label="Try again" size="lg" fullWidth onPress={() => (router.canGoBack() ? router.back() : toWallet())} style={{ marginHorizontal: space[6] }} />
          </Animated.View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space[4], paddingTop: space[2] },
  body: { flex: 1, justifyContent: "center", paddingBottom: space[12] },
  center: { alignItems: "center", gap: 6, paddingHorizontal: space[6] },
});
