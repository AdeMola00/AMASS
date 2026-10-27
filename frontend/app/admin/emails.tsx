/**
 * Admin — Email designs. Renders every branded email template (AMASS logo header, real Lagos photo hero, FIXA
 * footer) with sample data so the look can be checked without triggering a real send. The HTML comes from
 * GET /api/admin/email-previews/{kind}?format=json; native shows it in a WebView, web in a sandboxed iframe.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Chip, EmptyState, Screen, ScreenHeader, useToast } from "@/src/ui";

const KINDS: { key: string; label: string }[] = [
  { key: "reset", label: "Password reset" },
  { key: "receipt", label: "Top-up receipt" },
  { key: "unlock", label: "Unlock receipt" },
  { key: "viewing", label: "Viewing request" },
  { key: "viewing-confirmed", label: "Viewing confirmed" },
  { key: "home", label: "My Home reminder" },
  { key: "digest", label: "Daily digest" },
  { key: "agency", label: "Agency invite" },
];

export default function AdminEmailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [kind, setKind] = useState(KINDS[0].key);
  const [preview, setPreview] = useState<{ kind: string; subject: string; html: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (k: string) => {
      setLoading(true);
      try {
        setPreview(await api.adminEmailPreview(k));
      } catch (e: any) {
        toast.error("Couldn't load the preview", e?.message ?? "Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (user?.is_admin) load(kind);
  }, [user, kind, load]);

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Email designs" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to preview emails." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-emails-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Email designs" subtitle="Every email · AMASS & FIXA logos · real photos" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        {KINDS.map((k) => (
          <Chip key={k.key} label={k.label} selected={kind === k.key} tone="brand" onPress={() => setKind(k.key)} testID={`email-kind-${k.key}`} />
        ))}
      </ScrollView>
      <View style={[styles.subject, { backgroundColor: colors.surfaceAlt }]} testID="email-subject">
        <AppText variant="caption" tone="tertiary">
          Subject
        </AppText>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {preview?.subject ?? "…"}
        </AppText>
      </View>
      <View style={[styles.frame, { borderColor: colors.border, marginBottom: insets.bottom + space[3] }]} testID="email-preview-frame">
        {loading && !preview ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : preview ? (
          <EmailFrame html={preview.html} />
        ) : null}
      </View>
    </Screen>
  );
}

function EmailFrame({ html }: { html: string }) {
  if (Platform.OS === "web") {
    // react-native-webview has no web renderer; a sandboxed iframe shows the same HTML the mail client gets.
    return React.createElement("iframe", { srcDoc: html, sandbox: "", title: "Email preview", style: { border: 0, width: "100%", height: "100%", backgroundColor: "transparent" } });
  }
  return <WebView originWhitelist={["*"]} source={{ html }} style={{ flex: 1, backgroundColor: "transparent" }} scrollEnabled showsVerticalScrollIndicator={false} />;
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: space[4], paddingVertical: space[3], gap: 8 },
  subject: { marginHorizontal: space[4], marginBottom: space[3], paddingHorizontal: space[3], paddingVertical: 10, borderRadius: radii.lg, gap: 2 },
  frame: { flex: 1, marginHorizontal: space[4], borderRadius: radii.xl, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
