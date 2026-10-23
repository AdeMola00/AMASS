import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter, Link, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/contexts/auth";
import { AmassLogo } from "@/src/components/AmassLogo";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { GoogleSignInButton } from "@/src/components/GoogleSignInButton";
import { LegalConsent } from "@/src/components/LegalLinks";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Divider, Input, Screen } from "@/src/ui";

export default function Login() {
  const router = useRouter();
  const { colors } = useTheme();
  const { redirect } = useLocalSearchParams<{ redirect?: string; reset?: string }>();
  const params = useLocalSearchParams<{ reset?: string }>();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const goAfterAuth = () => {
    if (redirect && typeof redirect === "string" && redirect.startsWith("/")) {
      router.replace(redirect as any);
    } else {
      router.replace("/(tabs)");
    }
  };

  const submit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      goAfterAuth();
    } catch (e: any) {
      const msg = e?.message || "";
      if (/network|fetch|timeout|connection/i.test(msg)) {
        setError("Can't reach AMASS right now. Check your connection and try again.");
      } else {
        setError(msg || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]} testID="login-screen">
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AmassLogo size="xl" />
          <View style={{ gap: 6 }}>
            <AppText variant="display">Welcome back</AppText>
            <AppText variant="body" tone="secondary">
              Sign in to continue exploring properties across Africa.
            </AppText>
          </View>
        </View>

        <View style={styles.form}>
          <Button label="Continue with phone number" size="lg" fullWidth iconLeft="phone-portrait-outline" onPress={() => router.push({ pathname: "/(auth)/phone", params: redirect ? { redirect } : {} } as any)} testID="login-phone-button" />
          <View style={styles.divider}>
            <Divider style={{ flex: 1 }} />
            <AppText variant="caption" tone="tertiary">
              or sign in with email
            </AppText>
            <Divider style={{ flex: 1 }} />
          </View>
          {params.reset === "1" && (
            <View style={[styles.notice, { backgroundColor: colors.successSoft }]} testID="reset-success-banner" accessibilityRole="alert">
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <AppText variant="bodySm" color={colors.success} style={{ flex: 1 }}>
                Password reset. Sign in with your new password.
              </AppText>
            </View>
          )}
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@amass.africa" autoCapitalize="none" autoComplete="email" keyboardType="email-address" iconLeft="mail-outline" size="lg" testID="login-email" />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry={!showPw}
            autoComplete="password"
            textContentType="password"
            iconLeft="lock-closed-outline"
            size="lg"
            testID="login-password"
            iconRight={showPw ? "eye-off-outline" : "eye-outline"}
            onPressIconRight={() => setShowPw((v) => !v)}
            iconRightTestID="login-show-password"
            iconRightLabel={showPw ? "Hide password" : "Show password"}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <View style={styles.forgotRow}>
            <Link href="/(auth)/forgot-password" asChild>
              <Pressable hitSlop={8} testID="forgot-password-link" accessibilityRole="link">
                <AppText variant="caption" weight="bold">
                  Forgot password?
                </AppText>
              </Pressable>
            </Link>
          </View>
          {error && (
            <View style={[styles.notice, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <AppText variant="bodySm" tone="error" style={{ flex: 1 }} testID="login-error">
                {error}
              </AppText>
            </View>
          )}

          <Button label="Sign In" size="lg" fullWidth variant="secondary" loading={loading} onPress={submit} testID="login-submit-button" />

          <View style={styles.divider}>
            <Divider style={{ flex: 1 }} />
            <AppText variant="caption" tone="tertiary">
              or
            </AppText>
            <Divider style={{ flex: 1 }} />
          </View>

          <View style={{ gap: 10 }}>
            <GoogleSignInButton onError={(msg) => setError(msg)} />
            <AppleSignInButton onError={(msg) => setError(msg)} />
          </View>

          <View style={styles.footer}>
            <AppText variant="bodySm" tone="tertiary">
              New to AMASS?{" "}
            </AppText>
            <Link href="/(auth)/register" asChild>
              <Pressable testID="go-to-register" accessibilityRole="link" hitSlop={8}>
                <AppText variant="bodySm" weight="bold">
                  Create an account
                </AppText>
              </Pressable>
            </Link>
          </View>

          <LegalConsent action="signing in" />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: space[6], paddingTop: space[8] },
  header: { gap: space[5], marginBottom: space[8], alignItems: "flex-start" },
  form: { gap: space[4] },
  forgotRow: { alignItems: "flex-end", marginTop: -space[2] },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radii.md, padding: space[3] },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: space[2] },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: space[1] },
});
