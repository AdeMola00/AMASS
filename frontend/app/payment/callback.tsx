import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";

/**
 * Deep-link callback landing screen — providers redirect here after checkout.
 * Displayed while we poll the backend for the paid state (source of truth).
 */
export default function PaymentCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string; status?: string }>();
  const { refresh } = useWallet();
  const [state, setState] = useState<"checking" | "success" | "pending" | "failed">("checking");
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
            await refresh();
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setState("pending");
    })();
    return () => { cancelled = true; };
  }, [params.ref, refresh]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ padding: spacing.lg }}>
        <Pressable onPress={() => router.replace("/wallet")} style={styles.close}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      <View style={styles.body}>
        {state === "checking" && (
          <>
            <ActivityIndicator size="large" color={colors.red} />
            <Text style={styles.title}>Confirming payment…</Text>
            <Text style={styles.sub}>This usually takes a couple of seconds.</Text>
          </>
        )}
        {state === "success" && (
          <>
            <View style={[styles.icon, { backgroundColor: "#22C55E" }]}>
              <Ionicons name="checkmark" size={40} color="#fff" />
            </View>
            <Text style={styles.title}>Payment successful!</Text>
            <Text style={styles.sub}>
              {details?.credits ?? "Your"} {details?.currency ?? ""} tokens have been
              credited to your wallet.
            </Text>
            <Pressable
              style={[styles.cta, { backgroundColor: colors.ink }]}
              onPress={() => router.replace("/wallet")}
            >
              <Text style={styles.ctaText}>View Wallet</Text>
            </Pressable>
          </>
        )}
        {state === "pending" && (
          <>
            <View style={[styles.icon, { backgroundColor: "#F5B301" }]}>
              <Ionicons name="hourglass" size={32} color="#fff" />
            </View>
            <Text style={styles.title}>Payment pending</Text>
            <Text style={styles.sub}>
              We&apos;re waiting on the payment provider&apos;s confirmation. Your balance will update
              automatically the moment it clears.
            </Text>
            <Pressable
              style={[styles.cta, { backgroundColor: colors.ink }]}
              onPress={() => router.replace("/wallet")}
            >
              <Text style={styles.ctaText}>OK</Text>
            </Pressable>
          </>
        )}
        {state === "failed" && (
          <>
            <View style={[styles.icon, { backgroundColor: colors.red }]}>
              <Ionicons name="close" size={32} color="#fff" />
            </View>
            <Text style={styles.title}>Payment failed</Text>
            <Text style={styles.sub}>We couldn&apos;t confirm your payment. Please try again.</Text>
            <Pressable
              style={[styles.cta, { backgroundColor: colors.ink }]}
              onPress={() => router.back()}
            >
              <Text style={styles.ctaText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  close: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  body: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: spacing.xl, gap: 12,
  },
  icon: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: "center", justifyContent: "center", ...shadows.card,
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.text, letterSpacing: -0.5, marginTop: 8, textAlign: "center" },
  sub: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  cta: {
    marginTop: 20, height: 52, paddingHorizontal: 32,
    borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
});
