/**
 * Brand portal — set / reset password from an emailed single-use link (`/brand/set-password?token=…`).
 * Validates the token first so the brand sees who the login is for, then signs them straight in.
 */
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { brandApi, type BrandInvite } from "@/src/lib/brandApi";
import { AmassLogo } from "@/src/components/AmassLogo";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, EmptyState, Input, Screen, ScreenHeader, SkeletonRows, useToast } from "@/src/ui";

export default function BrandSetPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [invite, setInvite] = useState<BrandInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This link is missing its code. Open the link from your email again.");
      setLoading(false);
      return;
    }
    brandApi
      .invite(String(token))
      .then(setInvite)
      .catch((e: any) => setError(e?.message ?? "This link is no longer valid."))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (pw.length < 8) return toast.error("Use at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      const r = await brandApi.setPassword(String(token), pw);
      toast.success(`Welcome, ${r.brand.name}`, "Your password is set and you're signed in.");
      router.replace("/brand" as any);
    } catch (e: any) {
      toast.error("Couldn't set the password", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const goLogin = () => router.replace("/brand" as any);

  return (
    <Screen edges={["top", "bottom"]} testID="brand-set-password-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={invite?.kind === "reset" ? "New password" : "Activate brand login"} onBack={goLogin} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], gap: space[5] }} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : error || !invite ? (
          <EmptyState variant="error" icon="link-outline" title="Link not valid" body={error ?? "This link is no longer valid."} actionLabel="Go to Brand sign in" onAction={goLogin} testID="brand-set-password-invalid" />
        ) : (
          <>
            <View style={{ alignItems: "center", gap: 12 }}>
              <AmassLogo size="lg" />
              <AppText variant="display" align="center">
                {invite.kind === "reset" ? "Choose a new password" : "Set your password"}
              </AppText>
            </View>
            <Card elevation="xs" style={{ flexDirection: "row", alignItems: "center", gap: 12 }} testID="brand-set-password-brand">
              <View style={[styles.logo, { backgroundColor: colors.surfaceAlt }]}>
                {invite.brand_logo_url ? <Image source={{ uri: invite.brand_logo_url }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : <Ionicons name="storefront" size={22} color={colors.textSecondary} />}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <AppText variant="title" numberOfLines={1}>
                  {invite.brand_name ?? "Your brand"}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {invite.name ? `${invite.name} · ` : ""}
                  {invite.email}
                </AppText>
              </View>
            </Card>
            <View style={{ gap: space[4] }}>
              <Input label="New password" value={pw} onChangeText={setPw} secureTextEntry placeholder="At least 8 characters" testID="brand-set-pw" />
              <Input label="Repeat password" value={pw2} onChangeText={setPw2} secureTextEntry placeholder="Same again" error={pw2 && pw2 !== pw ? "Passwords don't match" : undefined} testID="brand-set-pw2" />
              <Button label={invite.kind === "reset" ? "Save and sign in" : "Activate and sign in"} variant="primary" size="lg" fullWidth iconLeft="checkmark" onPress={submit} loading={busy} disabled={pw.length < 8 || pw !== pw2} testID="brand-set-pw-submit" />
              <AppText variant="caption" tone="tertiary" align="center">
                {pw.length < 8 ? "Use at least 8 characters, then repeat it to continue." : pw !== pw2 ? "Repeat the same password to continue." : `This link works once. Afterwards sign in at Brand sign in with ${invite.email}.`}
              </AppText>
            </View>
          </>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: 48, height: 48, borderRadius: radii.lg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
