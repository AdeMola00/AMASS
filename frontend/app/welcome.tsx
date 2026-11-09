import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { TKey } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, ScreenHeader, tap, useToast } from "@/src/ui";

const CHOICES: { key: "agent" | "seller" | "fixa"; label: TKey; icon: any }[] = [
  { key: "agent", label: "pick_agent", icon: "home" },
  { key: "seller", label: "pick_seller", icon: "pricetag" },
  { key: "fixa", label: "pick_fixa", icon: "construct" },
];

export default function Welcome() {
  const { colors } = useTheme();
  const { t, speakText } = useSettings();
  const { roles, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const simple = picked.filter((p) => p !== "fixa") as ("agent" | "seller")[];
      if (simple.length) await api("/partner/roles", { body: { roles: simple } });
      await refresh();
      if (picked.includes("fixa")) router.replace("/fixa-join");
      else router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(false);
    }
  };

  const available = CHOICES.filter((c) => !roles.includes(c.key));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={t("welcome_title")} guide="guide_welcome" back={roles.length > 0} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        {available.map((c) => {
          const on = picked.includes(c.key);
          return (
            <Pressable
              key={c.key}
              testID={`welcome-pick-${c.key}`}
              onPress={() => {
                tap();
                setPicked((p) => (on ? p.filter((x) => x !== c.key) : [...p, c.key]));
              }}
              onLongPress={() => speakText(t(c.label))}
              style={{ minHeight: 112, borderRadius: radius.lg, borderWidth: 3, borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandSecondary : colors.surfaceSecondary, flexDirection: "row", alignItems: "center", padding: space.lg, gap: space.lg }}
            >
              <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: on ? colors.brandPrimary : colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={c.icon} size={36} color={on ? colors.onBrandPrimary : colors.onSurface} />
              </View>
              <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 20, color: colors.onSurface, lineHeight: 26 }}>{t(c.label)}</Text>
              <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={36} color={on ? colors.brandPrimary : colors.muted} />
            </Pressable>
          );
        })}
        <BigButton label={t("continue")} icon="arrow-forward" onPress={go} disabled={!picked.length} loading={busy} testID="welcome-continue-button" />
      </ScrollView>
    </View>
  );
}
