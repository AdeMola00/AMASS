import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { useSettings } from "@/src/settings";
import { useTheme } from "@/src/theme";
import { EmptyState, ScreenHeader } from "@/src/ui";
import { AgentWork } from "@/src/work/AgentWork";
import { BrandWork } from "@/src/work/BrandWork";
import { FixaWork } from "@/src/work/FixaWork";
import { SellerWork } from "@/src/work/SellerWork";

export default function Work() {
  const { colors } = useTheme();
  const { t } = useSettings();
  const { role } = useAuth();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const title = role === "agent" ? t("role_agent") : role === "seller" ? t("role_seller") : role === "fixa" ? t("role_fixa") : role === "brand" ? t("role_brand") : t("tab_work");
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={title} guide="guide_work" />
      {role === "agent" ? <AgentWork tab={tab} /> : role === "seller" ? <SellerWork tab={tab} /> : role === "fixa" ? <FixaWork tab={tab} /> : role === "brand" ? <BrandWork /> : <EmptyState icon="briefcase" text={t("empty_work")} />}
    </View>
  );
}
