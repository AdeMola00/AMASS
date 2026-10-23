/**
 * Phone sign-in · step 2 — one-time code. Resend with cooldown, clear errors, lockout message.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, TextInput } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Screen, useToast } from "@/src/ui";

const LEN = 6;

export default function VerifyCode() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { adoptSession, refresh } = useAuth();
  const p = useLocalSearchParams<{ phone: string; masked?: string; purpose?: string; cooldown?: string; mocked?: string; hint?: string; redirect?: string }>();
  const purpose = (p.purpose === "change" || p.purpose === "link" ? p.purpose : "signin") as "signin" | "change" | "link";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(Number(p.cooldown || 60));
  const [resending, setResending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  useEffect(() => {
    if (code.length === LEN) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const finish = (redirect?: string) => {
    if (redirect && redirect.startsWith("/")) router.replace(redirect as any);
    else router.replace("/(tabs)" as any);
  };

  const submit = async (c: string) => {
    if (loading || !p.phone) return;
    setError(null);
    setLoading(true);
    try {
      const r = await api.phoneVerify({ phone: p.phone, code: c, purpose });
      track("otp_verified", { purpose });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (purpose === "signin") {
        if (r.access_token && r.user) await adoptSession(r.access_token, r.user);
        if (r.is_new) router.replace({ pathname: "/neighbours/settings", params: { welcome: "1" } } as any);
        else finish(p.redirect);
      } else {
        await refresh();
        toast.success(purpose === "change" ? "Phone number updated" : "Phone verified", r.phone_masked ? `Now using ${r.phone_masked}` : undefined);
        router.back();
        router.back();
      }
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e?.message || "That code isn't right. Try again.");
      setCode("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (left > 0 || resending || !p.phone) return;
    setResending(true);
    setError(null);
    try {
      const r = await api.phoneResend({ phone: p.phone, purpose });
      setLeft(r.cooldown_seconds);
      toast.info("New code sent", r.mocked ? r.dev_hint : `Sent to ${r.phone_masked}`);
    } catch (e: any) {
      setError(e?.message || "Couldn't resend right now.");
    } finally {
      setResending(false);
    }
  };

  const cells = Array.from({ length: LEN }, (_, i) => code[i] ?? "");

  return (
    <Screen edges={["top", "bottom"]} testID="verify-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" testID="verify-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ gap: 6, marginBottom: space[6] }}>
          <AppText variant="display">Enter the code</AppText>
          <AppText variant="body" tone="secondary">
            We sent a 6-digit code to <AppText variant="bodyMedium">{p.masked || p.phone}</AppText>.
          </AppText>
          <Pressable onPress={() => router.back()} hitSlop={6} accessibilityRole="link" testID="verify-wrong-number">
            <AppText variant="caption" weight="bold">
              Wrong number?
            </AppText>
          </Pressable>
        </View>

        {p.mocked === "1" ? (
          <View style={[styles.notice, { backgroundColor: colors.infoSoft }]} testID="verify-dev-hint">
            <Ionicons name="flask-outline" size={16} color={colors.info} />
            <AppText variant="bodySm" color={colors.info} style={{ flex: 1 }}>
              {p.hint || "SMS is in test mode — use code 123456."}
            </AppText>
          </View>
        ) : null}

        <Pressable onPress={() => inputRef.current?.focus()} style={styles.cells} accessibilityLabel="Verification code" testID="verify-cells">
          {cells.map((ch, i) => {
            const active = i === code.length;
            return (
              <View key={i} style={[styles.cell, { backgroundColor: colors.surface, borderColor: error ? colors.error : active ? colors.text : colors.border, borderWidth: active || error ? 2 : 1 }]}>
                <AppText variant="h1" tabular>
                  {ch}
                </AppText>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, LEN))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={LEN}
          style={styles.hidden}
          testID="verify-code-input"
          accessibilityLabel="One-time code"
        />

        {error ? (
          <View style={[styles.notice, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <AppText variant="bodySm" tone="error" style={{ flex: 1 }} testID="verify-error">
              {error}
            </AppText>
          </View>
        ) : null}

        <Button label="Verify" size="lg" fullWidth loading={loading} disabled={code.length < LEN} onPress={() => submit(code)} testID="verify-submit" style={{ marginTop: space[2] }} />
        <View style={styles.resendRow}>
          <AppText variant="bodySm" tone="tertiary">
            Didn't get it?{" "}
          </AppText>
          <Pressable onPress={resend} disabled={left > 0 || resending} hitSlop={8} accessibilityRole="button" testID="verify-resend">
            <AppText variant="bodySm" weight="bold" tone={left > 0 ? "tertiary" : "primary"} tabular>
              {left > 0 ? `Resend in ${left}s` : resending ? "Sending…" : "Resend code"}
            </AppText>
          </Pressable>
        </View>
        <AppText variant="caption" tone="tertiary" align="center" style={{ marginTop: space[4] }}>
          Codes expire after 10 minutes. After 5 wrong attempts we pause sign-in for 15 minutes to protect your account.
        </AppText>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: space[6] },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -10, marginBottom: space[4] },
  cells: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  cell: { flex: 1, height: 60, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  hidden: { position: "absolute", opacity: 0, height: 1, width: 1 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radii.md, padding: space[3], marginBottom: space[3] },
  resendRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: space[4] },
});
