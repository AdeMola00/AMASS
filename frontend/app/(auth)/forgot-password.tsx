import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/lib/api";
import { AmassLogo } from "@/src/components/AmassLogo";
import { colors, radius, spacing, typography } from "@/src/constants/theme";

type Step = "request" | "reset";

export default function ForgotPassword() {
  const router = useRouter();
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

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12} testID="back-button">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>

        <View style={styles.header}>
          <AmassLogo size="lg" />
          <Text style={styles.title}>{step === "request" ? "Reset your password" : "Enter reset code"}</Text>
          <Text style={styles.subtitle}>
            {step === "request"
              ? "Enter your account email and we'll send you a 6-digit reset code."
              : `We sent a code to ${email}. It expires in 15 minutes.`}
          </Text>
        </View>

        {notice && step === "reset" && (
          <View style={styles.notice} testID="reset-notice">
            <Ionicons name="mail-outline" size={16} color={colors.emerald} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <View style={styles.form}>
          {step === "request" ? (
            <>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@amass.africa"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                testID="fp-email"
              />
              {error && <Text style={styles.error} testID="fp-error">{error}</Text>}
              <Pressable onPress={sendCode} style={[styles.cta, loading && { opacity: 0.6 }]} disabled={loading} testID="fp-send-code">
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Send reset code</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Field
                label="Reset code"
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                testID="fp-code"
              />
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                secureTextEntry={!showPw}
                autoComplete="password-new"
                textContentType="newPassword"
                testID="fp-new-password"
                right={
                  <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={12} testID="fp-show-password">
                    <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={colors.textTertiary} />
                  </Pressable>
                }
              />
              <Text style={[styles.hint, pwValid && { color: colors.emerald }]}>
                {pwValid ? "✓ Password length looks good" : "Use at least 6 characters"}
              </Text>
              {error && <Text style={styles.error} testID="fp-error">{error}</Text>}
              <Pressable onPress={doReset} style={[styles.cta, loading && { opacity: 0.6 }]} disabled={loading} testID="fp-reset-submit">
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Reset password</Text>}
              </Pressable>
              <Pressable onPress={resend} disabled={cooldown > 0} hitSlop={8} style={{ alignSelf: "center", marginTop: spacing.md }} testID="fp-resend">
                <Text style={[styles.link, cooldown > 0 && { color: colors.textMuted }]}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend code"}
                </Text>
              </Pressable>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remembered it? </Text>
            <Pressable onPress={() => router.replace("/(auth)/login")} testID="fp-back-to-login">
              <Text style={styles.link}>Back to sign in</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  right,
  testID,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string; right?: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput {...rest} style={styles.input} placeholderTextColor={colors.textMuted} testID={testID} />
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.md },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  header: { gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.xl },
  title: { ...typography.display, marginTop: spacing.lg },
  subtitle: { ...typography.body, color: colors.textTertiary, lineHeight: 22 },
  notice: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.emeraldSurface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  noticeText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  form: { gap: spacing.lg },
  field: { gap: 6 },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", marginLeft: 4 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", height: 56,
    borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.lg,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, fontWeight: "500" },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: -8, marginLeft: 4 },
  cta: {
    marginTop: spacing.md, height: 56, borderRadius: radius.pill,
    backgroundColor: colors.emerald, alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.red, fontSize: 13, marginTop: -8 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
  footerText: { color: colors.textTertiary, fontSize: 14 },
  link: { color: colors.emerald, fontSize: 14, fontWeight: "700" },
});
