import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { LANGS } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Avatar, BigButton, Card, ScreenHeader, tap } from "@/src/ui";

import { ROLE_META } from "@/src/roles";

export default function Me() {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const { t, lang, setLang, voiceOn, setVoiceOn, autoRead, setAutoRead, speak, voiceMissing } = useSettings();
  const { me, brand, kind, roles, role, setRole, signOut } = useAuth();
  const router = useRouter();
  const name = kind === "brand" ? brand?.brand?.name : me?.user?.full_name;
  const email = kind === "brand" ? brand?.account?.email : me?.user?.email;

  const H = ({ icon, text }: { icon: any; text: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm }}>
      <Ionicons name={icon} size={24} color={colors.onSurface} />
      <Text style={{ fontFamily: fonts.heavy, fontSize: 19, color: colors.onSurface }}>{text}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={t("tab_me")} guide="guide_me" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: bottomChrome + space.xl }}>
        <Card testID="me-profile-card" style={{ flexDirection: "row", alignItems: "center" }}>
          <Avatar name={name} uri={kind === "brand" ? brand?.brand?.logo_url : me?.user?.avatar_url} size={68} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.onSurface }}>{name}</Text>
            <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted }}>{email}</Text>
          </View>
        </Card>

        <H icon="language" text={t("language")} />
        <View style={{ gap: space.sm }}>
          {LANGS.map((l) => {
            const on = l.code === lang;
            return (
              <Pressable
                key={l.code}
                testID={`me-lang-${l.code}`}
                onPress={() => {
                  tap();
                  setLang(l.code);
                }}
                style={{ minHeight: 60, borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandSecondary : colors.surfaceSecondary, flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, gap: space.md }}
              >
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={28} color={on ? colors.brandPrimary : colors.muted} />
                <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface }}>{l.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {voiceMissing ? (
          <View testID="me-voice-missing" style={{ flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary }}>
            <Ionicons name="information-circle" size={24} color={colors.onBrandTertiary} />
            <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.onBrandTertiary }}>{t("voice_missing")}</Text>
          </View>
        ) : null}

        <H icon="volume-high" text={t("voice")} />
        <Card>
          <Row icon="mic" label={t("voice")} value={voiceOn} onChange={setVoiceOn} testID="me-voice-switch" />
          <Row icon="reader" label={t("voice_auto")} value={autoRead} onChange={setAutoRead} testID="me-autoread-switch" disabled={!voiceOn} />
          <BigButton label={t("voice_test")} icon="play-circle" tone="dark" compact onPress={() => speak("guide_home")} disabled={!voiceOn} testID="me-voice-test" />
        </Card>

        {kind === "user" ? (
          <>
            <H icon="briefcase" text={t("my_work_types")} />
            <View style={{ gap: space.sm }}>
              {roles.map((r) => (
                <Pressable
                  key={r}
                  testID={`me-role-${r}`}
                  onPress={() => {
                    tap();
                    setRole(r);
                    router.push("/(tabs)");
                  }}
                  style={{ minHeight: 60, borderRadius: radius.md, borderWidth: 2, borderColor: r === role ? colors.surfaceInverse : colors.border, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, gap: space.md }}
                >
                  <Ionicons name={ROLE_META[r].icon} size={26} color={colors.onSurface} />
                  <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface }}>{t(ROLE_META[r].label)}</Text>
                  {r === role ? <Ionicons name="checkmark-circle" size={28} color={colors.success} /> : null}
                </Pressable>
              ))}
              {roles.length < 3 ? <BigButton label={t("add_work_type")} icon="add-circle" tone="neutral" outline onPress={() => router.push("/welcome")} testID="me-add-role-button" /> : null}
            </View>
          </>
        ) : null}

        <View style={{ height: space.md }} />
        <BigButton label={t("sign_out")} icon="log-out" tone="neutral" outline onPress={signOut} testID="me-signout-button" />
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value, onChange, testID, disabled }: { icon: any; label: string; value: boolean; onChange: (v: boolean) => void; testID: string; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, opacity: disabled ? 0.5 : 1 }}>
      <Ionicons name={icon} size={26} color={colors.onSurface} />
      <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface }}>{label}</Text>
      <Switch testID={testID} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.success, false: colors.surfaceTertiary }} thumbColor={colors.surfaceSecondary} />
    </View>
  );
}
