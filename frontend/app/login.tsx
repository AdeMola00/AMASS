import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { LANGS } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, SpeakButton } from "@/src/ui";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, lang, setLang } = useSettings();
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!email.trim() || !pw) return setErr(t("fill_needed"));
    setErr("");
    setBusy(true);
    try {
      await signIn(email, pw);
      router.replace("/");
    } catch (e: any) {
      setErr(e?.status === 401 ? t("login_error") : e?.message || t("something_wrong"));
    } finally {
      setBusy(false);
    }
  };

  const field = { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.onSurface };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.lg, gap: space.lg }}>
        <View style={styles.top}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Image source={require("../assets/images/amass-emblem.png")} style={{ width: 44, height: 44 }} contentFit="contain" />
            <View style={[styles.partnerTag, { backgroundColor: colors.surfaceInverse }]}>
              <Text style={{ fontFamily: fonts.heavy, color: colors.onSurfaceInverse, fontSize: 12, letterSpacing: 1.5 }}>PARTNER</Text>
            </View>
          </View>
          <SpeakButton guide="guide_login" testID="login-speak-button" />
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={[styles.h1, { color: colors.onSurface }]}>{t("app_name")}</Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 18, color: colors.muted, lineHeight: 25 }}>{t("tagline")}</Text>
        </View>

        <View style={styles.roleRow}>
          {(["home", "pricetag", "construct", "storefront"] as const).map((ic, i) => (
            <View key={ic} style={[styles.roleDot, { backgroundColor: [colors.brandSecondary, colors.brandTertiary, colors.successSoft, colors.surfaceTertiary][i] }]}>
              <Ionicons name={ic} size={28} color={[colors.brandPrimary, colors.onBrandTertiary, colors.success, colors.onSurface][i]} />
            </View>
          ))}
        </View>

        <View style={styles.langRow}>
          {LANGS.map((l) => (
            <Pressable key={l.code} testID={`login-lang-${l.code}`} onPress={() => setLang(l.code)} style={[styles.lang, { backgroundColor: lang === l.code ? colors.surfaceInverse : colors.surfaceSecondary, borderColor: lang === l.code ? colors.surfaceInverse : colors.border }]}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: lang === l.code ? colors.onSurfaceInverse : colors.onSurface }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: space.sm }}>
          <View style={styles.labelRow}>
            <Ionicons name="mail" size={22} color={colors.onSurface} />
            <Text style={[styles.label, { color: colors.onSurface }]}>{t("email")}</Text>
          </View>
          <TextInput testID="login-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="name@email.com" placeholderTextColor={colors.muted} style={[styles.input, field]} />
        </View>
        <View style={{ gap: space.sm }}>
          <View style={styles.labelRow}>
            <Ionicons name="lock-closed" size={22} color={colors.onSurface} />
            <Text style={[styles.label, { color: colors.onSurface }]}>{t("password")}</Text>
          </View>
          <View>
            <TextInput testID="login-password-input" value={pw} onChangeText={setPw} secureTextEntry={!showPw} autoComplete="password" placeholder="••••••••" placeholderTextColor={colors.muted} style={[styles.input, field, { paddingRight: 100 }]} onSubmitEditing={submit} />
            <Pressable testID="login-toggle-password" onPress={() => setShowPw((v) => !v)} style={styles.eye}>
              <Ionicons name={showPw ? "eye-off" : "eye"} size={24} color={colors.onSurface} />
              <Text style={{ fontFamily: fonts.bold, color: colors.onSurface }}>{showPw ? t("hide_pw") : t("show")}</Text>
            </Pressable>
          </View>
        </View>

        {err ? (
          <View testID="login-error" style={[styles.err, { backgroundColor: colors.brandSecondary }]}>
            <Ionicons name="alert-circle" size={26} color={colors.brandPrimary} />
            <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.brandPrimary }}>{err}</Text>
          </View>
        ) : null}

        <BigButton label={t("sign_in")} icon="log-in" onPress={submit} loading={busy} testID="login-submit-button" />
        <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted, textAlign: "center", lineHeight: 21 }}>{t("login_help")}</Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  partnerTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  h1: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50 },
  roleRow: { flexDirection: "row", gap: space.md },
  roleDot: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  lang: { minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1.5, justifyContent: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: { fontFamily: fonts.bold, fontSize: 18 },
  input: { minHeight: 64, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: space.lg, fontFamily: fonts.medium, fontSize: 19 },
  eye: { position: "absolute", right: 8, top: 8, bottom: 8, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm },
  err: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.md },
});
