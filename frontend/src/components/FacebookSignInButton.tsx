/**
 * AMASS — "Continue with Facebook" (coming soon stub).
 *
 * Renders a disabled Facebook-blue button. Tap shows an alert. Real Meta OAuth
 * will require an App ID + Secret from the Facebook Developer console; we'll
 * wire it in as soon as those credentials are provided.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View, Alert } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, radius } from "@/src/constants/theme";

export function FacebookSignInButton() {
  const notify = () => {
    Alert.alert(
      "Facebook sign-in — coming soon",
      "We're wiring up Facebook login next. In the meantime, sign in with Google, Apple or email."
    );
  };
  return (
    <Pressable
      onPress={notify}
      style={styles.btn}
      testID="facebook-signin"
      accessibilityRole="button"
      accessibilityLabel="Continue with Facebook (coming soon)"
    >
      <View style={styles.row}>
        <Svg width={22} height={22} viewBox="0 0 48 48">
          <Path
            fill="#1877F2"
            d="M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24c0 12 8.7 21.9 20.1 23.7v-16.8h-6V24h6v-4.9c0-6 3.6-9.3 9-9.3 2.6 0 5.3.5 5.3.5v5.8h-3c-2.9 0-3.9 1.8-3.9 3.7V24h6.6l-1.1 6.9h-5.5v16.8C39.3 45.9 48 36 48 24z"
          />
        </Svg>
        <Text style={styles.label}>Continue with Facebook</Text>
        <View style={styles.soonPill}>
          <Text style={styles.soonText}>SOON</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    opacity: 0.85,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { fontSize: 15, fontWeight: "700", color: colors.text, letterSpacing: 0.2 },
  soonPill: {
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
  },
  soonText: { fontSize: 9, fontWeight: "900", color: colors.textSecondary, letterSpacing: 0.6 },
});
