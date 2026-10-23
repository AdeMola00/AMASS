import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/lib/api";
import { AmassLogo } from "@/src/components/AmassLogo";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, IconButton, Input, Screen } from "@/src/ui";

type Step = "request" | "reset";

export default function ForgotPassword() {
  const router = useRouter();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const pwValid = password.length >= 6;
  const codeValid = code.trim().length >= 4;

  const sendCode = async () => {
    setError(null);
    if (!emailValid) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.forgotPassword(email.trim().toLowerCase());
      setNotice(res.message);
      setStep("reset");
      setCooldown(60);
    } catch (e: any) {
      const msg = e?.message || "";
      setError(/network|fetch|timeout/i.test(msg) ? "Can't reach AMASS. Check your connection." : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    await sendCode();
  };

  const doReset = async () => {
    setError(null);
    if (!codeValid) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (!pwValid) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(email.trim().toLowerCase(), code.trim(), password);
      router.replace({ pathname: "/(auth)/login", params: { reset: "1" } } as any);
    } catch (e: any) {
      setError(e?.message || "That code is invalid or has expired. Request a new one.");
    } finally {
      setLoading(false);
    }
  };

  const errorBox = error ? (
    <View style={[styles.notice, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={16} color={colors.error} />
      <AppText variant="bodySm" tone="error" style={{ flex: 1 }} testID="fp-error">
        {error}
      </AppText>
    </View>
  ) : null;

  return (
    <Screen edges={["top", "bottom"]} testID="forgot-password-screen">
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <IconButton icon="chevron-back" label="Go back" onPress={() => router.back()} testID="back-button" style={{ marginLeft: -4 }} />

        <View style={styles.header}>
          <AmassLogo size="lg" />
          <View style={{ gap: 6 }}>
            <AppText variant="hero">{step === "request" ? "reset your password" : "enter reset code"}</AppText>
            <AppText variant="body" tone="secondary">
              {step === "request" ? "Enter your account email and we'll send you a 6-digit reset code." : `We sent a code to ${email}. It expires in 15 minutes.`}
            </AppText>
          </View>
        </View>

        {notice && step === "reset" && (
          <View style={[styles.notice, { backgroundColor: colors.successSoft, marginBottom: space[3] }]} testID="reset-notice">
            <Ionicons name="mail-outline" size={16} color={colors.success} />
            <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
              {notice}
            </AppText>
          </View>
        )}

        <View style={styles.form}>
          {step === "request" ? (
            <>
              <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@amass.africa" autoCapitalize="none" autoComplete="email" keyboardType="email-address" iconLeft="mail-outline" size="lg" testID="fp-email" onSubmitEditing={sendCode} returnKeyType="send" />
              {errorBox}
              <Button label="Send reset code" size="lg" fullWidth loading={loading} onPress={sendCode} testID="fp-send-code" />
            </>
          ) : (
            <>
              <Input
                label="Reset code"
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                iconLeft="keypad-outline"
                size="lg"
                style={{ letterSpacing: 4, fontSize: 18 }}
                testID="fp-code"
              />
              <Input
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                secureTextEntry={!showPw}
                autoComplete="password-new"
                textContentType="newPassword"
                iconLeft="lock-closed-outline"
                size="lg"
                testID="fp-new-password"
                iconRight={showPw ? "eye-off-outline" : "eye-outline"}
                onPressIconRight={() => setShowPw((v) => !v)}
                iconRightTestID="fp-show-password"
                iconRightLabel={showPw ? "Hide password" : "Show password"}
                helper={pwValid ? "✓ Password length looks good" : "Use at least 6 characters"}
                onSubmitEditing={doReset}
                returnKeyType="go"
              />
              {errorBox}
              <Button label="Reset password" size="lg" fullWidth loading={loading} onPress={doReset} testID="fp-reset-submit" />
              <Pressable onPress={resend} disabled={cooldown > 0} hitSlop={8} style={{ alignSelf: "center", marginTop: space[1] }} testID="fp-resend" accessibilityRole="button">
                <AppText variant="bodySm" weight="bold" tone={cooldown > 0 ? "muted" : "primary"}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend code"}
                </AppText>
              </Pressable>
            </>
          )}

          <View style={styles.footer}>
            <AppText variant="bodySm" tone="tertiary">
              Remembered it?{" "}
            </AppText>
            <Pressable onPress={() => router.replace("/(auth)/login")} testID="fp-back-to-login" accessibilityRole="link" hitSlop={8}>
              <AppText variant="bodySm" weight="bold">
                Back to sign in
              </AppText>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: space[6], paddingTop: space[3] },
  header: { gap: space[4], marginTop: space[3], marginBottom: space[6], alignItems: "flex-start" },
  form: { gap: space[4] },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radii.md, padding: space[3] },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: space[2] },
});
