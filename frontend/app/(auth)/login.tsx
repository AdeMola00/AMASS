import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/contexts/auth";
import { AmassLogo } from "@/src/components/AmassLogo";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { colors, radius, spacing, typography } from "@/src/constants/theme";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <AmassLogo size="xl" />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to continue exploring properties across Africa.
          </Text>
        </View>

        <View style={styles.form}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@amass.africa"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            testID="login-email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry={!showPw}
            testID="login-password"
            right={
              <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={12}>
                <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={colors.textTertiary} />
              </Pressable>
            }
          />
          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            style={[styles.cta, loading && { opacity: 0.6 }]}
            disabled={loading}
            testID="login-submit-button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Sign In</Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <AppleSignInButton
            onError={(msg) => setError(msg)}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to AMASS? </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable testID="go-to-register">
                <Text style={styles.link}>Create an account</Text>
              </Pressable>
            </Link>
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
        <TextInput
          {...rest}
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          testID={testID}
        />
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.xxl },
  title: { ...typography.display, marginTop: spacing.xl },
  subtitle: { ...typography.body, color: colors.textTertiary, lineHeight: 22 },
  form: { gap: spacing.lg },
  field: { gap: 6 },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
    marginLeft: 4,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  cta: {
    marginTop: spacing.md,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: {
    color: colors.red,
    fontSize: 13,
    marginTop: -8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  footerText: { color: colors.textTertiary, fontSize: 14 },
  link: { color: colors.emerald, fontSize: 14, fontWeight: "700" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
    gap: 10,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { color: colors.textTertiary, fontSize: 12, fontWeight: "700" },
});
