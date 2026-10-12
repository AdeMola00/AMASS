import React, { useEffect, useState } from "react";
import { Platform, View, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/contexts/auth";

/**
 * Native Sign in with Apple button.
 *  - iOS only. Renders nothing on Android/web (App Store requires the native button).
 *  - Gated behind `AppleAuthentication.isAvailableAsync()`.
 *  - Full-name + email are populated ONLY on the first sign-in — we forward
 *    them to the backend so the account is bootstrapped correctly.
 *  - After a successful sign-in, navigates to the tabs root.
 */
export function AppleSignInButton({
  cornerRadius = 26,
  onError,
}: {
  cornerRadius?: number;
  onError?: (message: string) => void;
}) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const { signInWithApple } = useAuth();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Platform.OS !== "ios" || !available) return null;

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("Apple returned no identity token");
      }

      const full_name = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName]
            .filter(Boolean)
            .join(" ")
            .trim() || undefined
        : undefined;

      await signInWithApple({
        identity_token: credential.identityToken,
        full_name,
        email: credential.email || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/(tabs)");
    } catch (e: any) {
      // User cancel → silent
      if (e?.code === "ERR_REQUEST_CANCELED" || e?.code === "ERR_CANCELED") {
        return;
      }
      const msg = e?.message || "Couldn't sign in with Apple. Please try again.";
      if (onError) onError(msg);
      else Alert.alert("Sign in failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={cornerRadius}
        style={styles.button}
        onPress={signIn}
      />
      {busy && (
        <View style={styles.busy} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  button: { width: "100%", height: 52 },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 26,
  },
});
