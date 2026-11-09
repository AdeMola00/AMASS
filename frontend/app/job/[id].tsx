import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fmtDay } from "@/src/format";
import { TKey } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Avatar, BigButton, Card, ErrorView, LoadingView, ScreenHeader, StatusPill, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";
import { STAGE_ICON } from "@/src/work/FixaWork";

const STAGES = ["on_the_way", "working", "finished"] as const;

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, lang } = useSettings();
  const { refresh } = useAuth();
  const toast = useToast();
  const d = useLoad(async () => (await api<{ items: any[] }>("/fixa/jobs")).items.find((j) => j.id === id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const j = d.data;

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try {
      await fn();
      toast.show(t("saved"));
      d.reload();
      refresh();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  const stageIdx = j?.job_stage ? STAGES.indexOf(j.job_stage) : -1;
  const nextStage = STAGES[stageIdx + 1];
  const phone = (j?.customer_phone || "").replace(/[^\d+]/g, "");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={j?.trade || t("role_fixa")} guide="guide_job" back />
      {d.loading && !d.data ? (
        <LoadingView />
      ) : !j ? (
        <ErrorView onRetry={d.reload} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Avatar name={j.customer_name} size={64} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.onSurface }}>{j.customer_name}</Text>
                <StatusPill status={j.job_stage === "finished" && j.status === "confirmed" ? "completed" : j.status} testID="job-status" />
              </View>
            </View>
            <Info icon="calendar" text={`${fmtDay(j.scheduled_date, lang)} · ${j.scheduled_time}`} />
            <Info icon="location" text={j.address} />
            {j.notes ? <Info icon="chatbox-ellipses" text={j.notes} /> : null}
            {phone ? (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <BigButton label={t("call")} icon="call" tone="dark" compact onPress={() => Linking.openURL(`tel:${phone}`)} testID="job-call-button" />
                </View>
                <View style={{ flex: 1 }}>
                  <BigButton label={t("whatsapp")} icon="logo-whatsapp" tone="success" compact onPress={() => Linking.openURL(`https://wa.me/${phone.replace("+", "")}`)} testID="job-whatsapp-button" />
                </View>
              </View>
            ) : null}
          </Card>

          {j.status === "pending" ? (
            <View style={{ gap: space.sm }}>
              <BigButton label={t("accept")} icon="checkmark-circle" tone="success" onPress={() => run("confirm", () => api(`/fixa/jobs/${j.id}/confirm`, { body: {} }))} loading={busy === "confirm"} testID="job-detail-accept" />
              <BigButton label={t("decline")} icon="close-circle" tone="neutral" outline onPress={() => run("decline", () => api(`/fixa/jobs/${j.id}/decline`, { body: {} }))} loading={busy === "decline"} testID="job-detail-decline" />
            </View>
          ) : null}

          {j.status === "confirmed" || j.job_stage ? (
            <View style={{ gap: space.md }} testID="job-stepper">
              {STAGES.map((s, i) => {
                const done = i <= stageIdx;
                const isNext = s === nextStage;
                return (
                  <View key={s} testID={`job-stage-${s}`} style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 2, borderColor: done ? colors.success : isNext ? colors.brandPrimary : colors.border, backgroundColor: done ? colors.successSoft : colors.surfaceSecondary }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: done ? colors.success : isNext ? colors.brandPrimary : colors.surfaceTertiary }}>
                      <Ionicons name={done ? "checkmark" : STAGE_ICON[s]} size={30} color={done || isNext ? colors.onSuccess : colors.muted} />
                    </View>
                    <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 19, color: colors.onSurface }}>
                      {i + 1}. {t(`stage_${s}` as TKey)}
                    </Text>
                  </View>
                );
              })}
              {nextStage && j.status === "confirmed" ? (
                <BigButton label={t(`stage_${nextStage}` as TKey)} icon={STAGE_ICON[nextStage]} tone={nextStage === "finished" ? "success" : "brand"} onPress={() => run("stage", () => api(`/partner/fixa/jobs/${j.id}/stage`, { body: { stage: nextStage } }))} loading={busy === "stage"} testID="job-next-stage-button" />
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Info({ icon, text }: { icon: any; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
      <Ionicons name={icon} size={24} color={colors.brandPrimary} />
      <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface, lineHeight: 23 }}>{text}</Text>
    </View>
  );
}
