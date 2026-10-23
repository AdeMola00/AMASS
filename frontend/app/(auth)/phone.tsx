/**
 * Phone sign-in · step 1 — country code + number.
 * Also reused (purpose=change|link) from Settings to update the phone on an existing account.
 */
import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { AmassLogo } from "@/src/components/AmassLogo";
import { LegalConsent } from "@/src/components/LegalLinks";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Input, Screen, ScreenHeader, Sheet } from "@/src/ui";

export const COUNTRIES: { code: string; dial: string; name: string; flag: string; len: [number, number] }[] = [
  { code: "NG", dial: "+234", name: "Nigeria", flag: "🇳🇬", len: [10, 10] },
  { code: "GH", dial: "+233", name: "Ghana", flag: "🇬🇭", len: [9, 9] },
  { code: "KE", dial: "+254", name: "Kenya", flag: "🇰🇪", len: [9, 9] },
  { code: "ZA", dial: "+27", name: "South Africa", flag: "🇿🇦", len: [9, 9] },
  { code: "RW", dial: "+250", name: "Rwanda", flag: "🇷🇼", len: [9, 9] },
  { code: "UG", dial: "+256", name: "Uganda", flag: "🇺🇬", len: [9, 9] },
  { code: "TZ", dial: "+255", name: "Tanzania", flag: "🇹🇿", len: [9, 9] },
  { code: "CI", dial: "+225", name: "Côte d'Ivoire", flag: "🇨🇮", len: [8, 10] },
  { code: "SN", dial: "+221", name: "Senegal", flag: "🇸🇳", len: [9, 9] },
  { code: "CM", dial: "+237", name: "Cameroon", flag: "🇨🇲", len: [9, 9] },
  { code: "EG", dial: "+20", name: "Egypt", flag: "🇪🇬", len: [10, 10] },
  { code: "MA", dial: "+212", name: "Morocco", flag: "🇲🇦", len: [9, 9] },
  { code: "ET", dial: "+251", name: "Ethiopia", flag: "🇪🇹", len: [9, 9] },
  { code: "GB", dial: "+44", name: "United Kingdom", flag: "🇬🇧", len: [10, 10] },
  { code: "US", dial: "+1", name: "United States / Canada", flag: "🇺🇸", len: [10, 10] },
  { code: "AE", dial: "+971", name: "United Arab Emirates", flag: "🇦🇪", len: [9, 9] },
];

export function formatNational(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 11)}`;
}

export default function PhoneSignIn() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ purpose?: string; redirect?: string }>();
  const purpose = (params.purpose === "change" || params.purpose === "link" ? params.purpose : "signin") as "signin" | "change" | "link";
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [number, setNumber] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = number.replace(/\D/g, "").replace(/^0/, "");
  const valid = digits.length >= country.len[0] && digits.length <= country.len[1] + 1;
  const filtered = useMemo(() => COUNTRIES.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.dial.includes(query)), [query]);

  const submit = async () => {
    setError(null);
    if (!valid) {
      setError(`Enter a valid ${country.name} mobile number.`);
      return;
    }
    setLoading(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      track("signin_start", { method: "phone", purpose });
      const r = await api.phoneStart({ dial_code: country.dial, number: digits, purpose });
      track("otp_sent", { purpose });
      router.push({ pathname: "/(auth)/verify", params: { phone: r.phone, masked: r.phone_masked, purpose, cooldown: String(r.cooldown_seconds), mocked: r.mocked ? "1" : "0", hint: r.dev_hint ?? "", redirect: params.redirect ?? "" } } as any);
    } catch (e: any) {
      const msg = e?.message || "";
      setError(/network|fetch|timeout|connection/i.test(msg) ? "Can't reach AMASS right now. Check your connection and try again." : msg || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const title = purpose === "signin" ? "Continue with your phone" : purpose === "change" ? "Change phone number" : "Add your phone number";
  const sub = purpose === "signin" ? "We'll text you a one-time code. No password needed." : purpose === "change" ? "Your account, saves and wallet stay exactly as they are — only the number changes." : "Verify once so friends can find you and estates can trust you.";

  return (
    <Screen edges={["top", "bottom"]} testID="phone-signin-screen">
      <Stack.Screen options={{ headerShown: false }} />
      {purpose !== "signin" ? <ScreenHeader title={title} /> : null}
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {purpose === "signin" ? (
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" testID="phone-back">
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <AmassLogo size="lg" />
            <View style={{ gap: 6 }}>
              <AppText variant="hero">{title.toLowerCase()}</AppText>
              <AppText variant="body" tone="secondary">
                {sub}
              </AppText>
            </View>
          </View>
        ) : (
          <AppText variant="body" tone="secondary" style={{ marginBottom: space[4] }}>
            {sub}
          </AppText>
        )}

        <View style={styles.form}>
          <AppText variant="label" tone="secondary">
            Mobile number
          </AppText>
          <View style={styles.row}>
            <Pressable onPress={() => setPickerOpen(true)} style={[styles.country, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`Country ${country.name} ${country.dial}`} testID="phone-country">
              <AppText variant="h3">{country.flag}</AppText>
              <AppText variant="bodyMedium" tabular>
                {country.dial}
              </AppText>
              <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Input value={formatNational(number)} onChangeText={(t) => setNumber(t.replace(/\D/g, "").slice(0, 12))} placeholder={country.code === "NG" ? "801 234 5678" : "Mobile number"} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" size="lg" autoFocus onSubmitEditing={submit} returnKeyType="go" testID="phone-number" />
            </View>
          </View>
          {error ? (
            <View style={[styles.notice, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <AppText variant="bodySm" tone="error" style={{ flex: 1 }} testID="phone-error">
                {error}
              </AppText>
            </View>
          ) : null}
          <Button label="Send code" size="lg" fullWidth loading={loading} disabled={!digits} onPress={submit} iconRight="arrow-forward" testID="phone-submit" />
          <AppText variant="caption" tone="tertiary" align="center">
            Standard SMS rates may apply. We never show your number to other members.
          </AppText>
          {purpose === "signin" ? (
            <>
              <Button label="Use email instead" variant="ghost" fullWidth onPress={() => router.replace("/(auth)/login" as any)} testID="phone-use-email" />
              <LegalConsent action="continuing" />
            </>
          ) : null}
        </View>
      </KeyboardAwareScrollView>

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose country" testID="country-sheet">
        <Input value={query} onChangeText={setQuery} placeholder="Search country or code" iconLeft="search-outline" autoFocus testID="country-search" />
        <ScrollView style={{ maxHeight: 360, marginTop: 8 }} keyboardShouldPersistTaps="handled">
          {filtered.map((c) => (
            <Pressable
              key={c.code}
              onPress={() => {
                setCountry(c);
                setPickerOpen(false);
                setQuery("");
              }}
              style={[styles.countryRow, { borderBottomColor: colors.border }]}
              accessibilityRole="button"
              testID={`country-${c.code}`}
            >
              <AppText variant="h3">{c.flag}</AppText>
              <AppText variant="body" style={{ flex: 1 }}>
                {c.name}
              </AppText>
              <AppText variant="bodyMedium" tone="secondary" tabular>
                {c.dial}
              </AppText>
              {c.code === country.code ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: space[6], paddingTop: space[6] },
  header: { gap: space[5], marginBottom: space[6], alignItems: "flex-start" },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -10 },
  form: { gap: space[3] },
  row: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  country: { flexDirection: "row", alignItems: "center", gap: 6, height: 56, paddingHorizontal: 12, borderRadius: radii.md, borderWidth: 1 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radii.md, padding: space[3] },
  countryRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
