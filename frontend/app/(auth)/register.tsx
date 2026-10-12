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
import { AppText, Button, Divider, IconButton, Input, Screen } from "@/src/ui";

export default function Register() {
  const router = useRouter();
  const { colors } = useTheme();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const pwValid = password.length >= 6;

  const submit = async () => {
    setError(null);
    if (!fullName.trim() || !email.trim() || !password) {
      setError("Full name, email and password are required.");
      return;
    }
    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!pwValid) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, fullName.trim(), phone.trim() || undefined);
      if (redirect && typeof redirect === "string" && redirect.startsWith("/")) {
        router.replace(redirect as any);
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      const msg = e?.message || "";
      if (/network|fetch|timeout|connection/i.test(msg)) {
        setError("Can't reach AMASS right now. Check your connection and try again.");
      } else {
        setError(msg || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]} testID="register-screen">
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <IconButton icon="chevron-back" label="Go back" onPress={() => router.back()} testID="back-button" style={{ marginLeft: -4 }} />

        <View style={styles.header}>
          <AmassLogo size="lg" />
          <View style={{ gap: 6 }}>
            <AppText variant="display">Create your account</AppText>
            <AppText variant="body" tone="secondary">
              Join thousands discovering premium properties across Africa.
            </AppText>
          </View>
        </View>

        <View style={styles.form}>
          <Input label="Full name" value={fullName} onChangeText={setFullName} placeholder="Adaeze Okoye" autoComplete="name" textContentType="name" iconLeft="person-outline" size="lg" testID="reg-name" />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@amass.africa"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            iconLeft="mail-outline"
            size="lg"
            error={email.length > 3 && !emailValid ? "Enter a valid email address" : null}
            testID="reg-email"
          />
          <Input label="Phone (optional)" value={phone} onChangeText={setPhone} placeholder="+234 …" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" iconLeft="call-outline" size="lg" testID="reg-phone" />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry={!showPw}
            autoComplete="password-new"
            textContentType="newPassword"
            iconLeft="lock-closed-outline"
            size="lg"
            testID="reg-password"
            iconRight={showPw ? "eye-off-outline" : "eye-outline"}
            onPressIconRight={() => setShowPw((v) => !v)}
            iconRightTestID="reg-show-password"
            iconRightLabel={showPw ? "Hide password" : "Show password"}
            helper={pwValid ? "✓ Password length looks good" : "Password must be at least 6 characters"}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          {error && (
            <View style={[styles.notice, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <AppText variant="bodySm" tone="error" style={{ flex: 1 }} testID="reg-error">
                {error}
              </AppText>
            </View>
          )}

          <Button label="Create Account" size="lg" fullWidth loading={loading} onPress={submit} testID="register-submit-button" />

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
              Already have an account?{" "}
            </AppText>
            <Link href="/(auth)/login" asChild>
              <Pressable accessibilityRole="link" hitSlop={8} testID="go-to-login">
                <AppText variant="bodySm" weight="bold">
                  Sign in
                </AppText>
              </Pressable>
            </Link>
          </View>

          <LegalConsent action="creating an account" />
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
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: space[1] },
});
