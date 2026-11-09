import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CITIES } from "@/src/roles";
import { useSettings } from "@/src/settings";
import { fonts, space, useTheme } from "@/src/theme";
import { BigButton, ScreenHeader, useToast } from "@/src/ui";
import { BigInput, OptionGrid } from "@/src/Wizard";

const TRADES = [
  { key: "Plumbing", icon: "water" },
  { key: "Electrical", icon: "flash" },
  { key: "AC Repair", icon: "snow" },
  { key: "Carpentry", icon: "hammer" },
  { key: "Painting", icon: "color-palette" },
  { key: "Cleaning", icon: "sparkles" },
  { key: "Generator", icon: "battery-charging" },
  { key: "Solar", icon: "sunny" },
  { key: "Tiling", icon: "grid" },
  { key: "Movers", icon: "car" },
];

export default function FixaJoin() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useSettings();
  const { me, refresh, setRole } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [biz, setBiz] = useState(me?.user?.full_name || "");
  const [trade, setTrade] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [phone, setPhone] = useState(me?.user?.phone || "");
  const [busy, setBusy] = useState(false);
  const valid = biz.trim().length >= 2 && !!trade && !!city && phone.replace(/\D/g, "").length >= 7;

  const submit = async () => {
    setBusy(true);
    try {
      await api("/fixa/apply", { body: { business_name: biz.trim(), categories: [trade], city, phone: phone.trim() } });
      await refresh();
      setRole("fixa");
      toast.show(t("fixa_pending"));
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(false);
    }
  };

  const L = ({ text }: { text: string }) => <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurface }}>{text}</Text>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={t("join_fixa")} guide="guide_welcome" back />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        <L text={t("trade")} />
        <OptionGrid testPrefix="fixa-trade" value={trade} onChange={setTrade} options={TRADES.map((x) => ({ key: x.key, label: x.key, icon: x.icon }))} />
        <L text={t("business_name")} />
        <BigInput testID="fixa-business-input" value={biz} onChangeText={setBiz} placeholder={t("business_name")} />
        <L text={t("city")} />
        <OptionGrid testPrefix="fixa-city" value={city} onChange={setCity} options={CITIES.map((c) => ({ key: c.name, label: c.name, icon: "location" }))} />
        <L text={t("phone")} />
        <BigInput testID="fixa-phone-input" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+234" />
        <BigButton label={t("send")} icon="send" onPress={submit} disabled={!valid} loading={busy} testID="fixa-submit-button" />
      </KeyboardAwareScrollView>
    </View>
  );
}
