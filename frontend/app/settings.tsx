import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Switch, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useWallet } from "@/src/contexts/wallet";
import { openPrivacyPolicy, openTerms } from "@/src/lib/legal";
import { storage } from "@/src/utils/storage";
import { useTheme, useThemeMode, ThemeMode } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, ListRow, RowGroup, Screen, ScreenHeader, SegmentedControl, useToast } from "@/src/ui";

const PREF_PUSH = "amass_pref_push";
const PREF_EMAIL = "amass_pref_email";

export default function Settings() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const { mass } = useWallet();
  const { colors } = useTheme();
  const { mode, setMode } = useThemeMode();
  const toast = useToast();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    storage.getItem<boolean>(PREF_PUSH, true).then((v) => setPushEnabled(v ?? true));
    storage.getItem<boolean>(PREF_EMAIL, false).then((v) => setEmailEnabled(v ?? false));
  }, []);

  const savePref = (key: string, setter: (v: boolean) => void) => (v: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setter(v);
    storage.setItem(key, v).catch(() => {});
  };

  const confirm = (title: string, body: string, okLabel: string, onOk: () => void) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) onOk();
      return;
    }
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: okLabel, style: "destructive", onPress: onOk },
    ]);
  };

  const onDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    confirm(
      "Delete your AMASS account?",
      "This is permanent. We'll erase your profile, subscription, wallet, saved searches, favourites and notifications. Properties you listed are anonymised.\n\nThis cannot be undone.",
      "Delete forever",
      () =>
        confirm("Are you absolutely sure?", "This erases your account immediately.", "Yes, delete", async () => {
          setDeleting(true);
          try {
            const res = await api.deleteMyAccount();
            if (res.ok) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              await signOut();
              toast.success("Account deleted", "Your AMASS account and personal data have been erased.");
              router.replace("/(auth)/login" as any);
            }
          } catch (e: any) {
            toast.error("Deletion failed", e?.message ?? "We couldn't delete your account. Contact hello@amass.africa");
          } finally {
            setDeleting(false);
          }
        })
    );
  };

  const version = Constants.expoConfig?.version ?? "1.0.0";
  const plan = mass?.subscription?.plan_id;

  return (
    <Screen testID="settings-screen">
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <RowGroup title="Appearance">
          <View style={{ padding: space[4], gap: 12 }}>
            <View style={{ gap: 2 }}>
              <AppText variant="bodyMedium">Theme</AppText>
              <AppText variant="caption" tone="tertiary">
                Light and dark are each designed deliberately — pick one, or follow your device.
              </AppText>
            </View>
            <SegmentedControl<ThemeMode>
              value={mode}
              onChange={setMode}
              testIDPrefix="theme"
              options={[
                { value: "system", label: "System", icon: "phone-portrait-outline" },
                { value: "light", label: "Light", icon: "sunny-outline" },
                { value: "dark", label: "Dark", icon: "moon-outline" },
              ]}
            />
          </View>
        </RowGroup>

        <RowGroup title="Notifications">
          <ListRow
            icon="notifications-outline"
            iconTone="brand"
            label="Push notifications"
            caption="New leads, messages and unlock receipts"
            trailing={<Switch value={pushEnabled} onValueChange={savePref(PREF_PUSH, setPushEnabled)} trackColor={{ true: colors.primary }} testID="settings-push-notifications" />}
          />
          <ListRow
            icon="mail-outline"
            label="Email updates"
            caption="Saved-search alerts and product news"
            last
            trailing={<Switch value={emailEnabled} onValueChange={savePref(PREF_EMAIL, setEmailEnabled)} trackColor={{ true: colors.primary }} testID="settings-email-updates" />}
          />
        </RowGroup>

        <RowGroup title="Security">
          <ListRow icon="lock-closed-outline" label="Change password" caption={`We'll email a reset code to ${user?.email ?? "your address"}`} onPress={() => router.push({ pathname: "/(auth)/forgot-password", params: { email: user?.email ?? "" } } as any)} last testID="settings-change-password" />
        </RowGroup>

        <RowGroup title="Account">
          <ListRow icon="star-outline" iconTone="premium" label="Subscription" value={plan ? `${plan} plan` : "No active plan"} onPress={() => router.push("/subscribe")} testID="settings-subscription" />
          <ListRow icon="pricetags-outline" label="Agent plans" caption="Starter · Pro · Agency" onPress={() => router.push("/agent-plans")} testID="settings-agent-plans" />
          <ListRow icon="trash-outline" label={deleting ? "Deleting…" : "Delete account"} caption="Permanently erase your account and data" onPress={deleting ? undefined : onDeleteAccount} destructive last testID="settings-delete-account" />
        </RowGroup>

        <RowGroup title="Legal">
          <ListRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => openPrivacyPolicy()} testID="settings-privacy-policy" />
          <ListRow icon="document-text-outline" label="Terms of Service" onPress={() => openTerms()} last testID="settings-terms-of-service" />
        </RowGroup>

        <AppText variant="caption" tone="muted" align="center" style={styles.version}>
          AMASS v{version} · Africa&apos;s Property OS
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  version: { marginTop: space[2] },
});
