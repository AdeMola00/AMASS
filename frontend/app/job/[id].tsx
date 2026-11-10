import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fmtDay } from "@/src/format";
import { TKey } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Avatar, BigButton, Card, ErrorView, LoadingView, ScreenHeader, Sheet, StatusPill, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";
import { BigInput } from "@/src/Wizard";
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
  const [askPaid, setAskPaid] = useState(false);
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
                <BigButton
                  label={t(`stage_${nextStage}` as TKey)}
                  icon={STAGE_ICON[nextStage]}
                  tone={nextStage === "finished" ? "success" : "brand"}
                  onPress={() =>
                    run("stage", async () => {
                      await api(`/partner/fixa/jobs/${j.id}/stage`, { body: { stage: nextStage } });
                      // Just finished → ask for the price right away so no earnings are missed.
                      if (nextStage === "finished" && !j.amount_paid) setAskPaid(true);
                    })
                  }
                  loading={busy === "stage"}
                  testID="job-next-stage-button"
                />
              ) : null}
            </View>
          ) : null}
          {(j.job_stage === "finished" || j.status === "completed") && !askPaid ? <PaidCard key={j.amount_paid || 0} job={j} onSaved={d.reload} /> : null}
        </ScrollView>
      )}
      {j ? (
        <Sheet visible={askPaid} onClose={() => setAskPaid(false)} title={t("job_paid_q")} testID="job-paid-sheet">
          <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: colors.muted }}>{t("job_paid_why")}</Text>
          <PaidForm
            job={j}
            autoFocus
            onSaved={() => {
              setAskPaid(false);
              d.reload();
              refresh();
            }}
          />
          <BigButton label={t("later")} icon="time" tone="neutral" outline onPress={() => setAskPaid(false)} testID="job-paid-later" />
        </Sheet>
      ) : null}
    </View>
  );
}

// After the job: the pro types what the customer paid → feeds "Money from jobs" on the week card and charts.
function PaidForm({ job, onSaved, autoFocus }: { job: any; onSaved: () => void; autoFocus?: boolean }) {
  const { t } = useSettings();
  const toast = useToast();
  const [value, setValue] = useState(job.amount_paid ? String(job.amount_paid) : "");
  const [busy, setBusy] = useState(false);
  const n = parseInt(value.replace(/\D/g, ""), 10) || 0;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/partner/fixa/jobs/${job.id}/paid`, { body: { amount: n } });
      toast.show(t("saved"));
      onSaved();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <BigInput testID="job-paid-input" money value={value ? naira(n) : ""} onChangeText={setValue} keyboardType="number-pad" placeholder="₦0" autoFocus={autoFocus} />
      <BigButton label={t("save")} icon="checkmark-circle" tone="success" onPress={save} disabled={n <= 0} loading={busy} testID="job-paid-save" />
    </>
  );
}

function PaidCard({ job, onSaved }: { job: any; onSaved: () => void }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const [editing, setEditing] = useState(!job.amount_paid);

  return (
    <Card testID="job-paid-card">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="cash" size={28} color={colors.success} />
        </View>
        <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurface }}>{editing ? t("job_paid_q") : t("job_paid_label")}</Text>
      </View>
      {editing ? (
        <PaidForm
          job={job}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Text testID="job-paid-amount" style={{ flex: 1, fontFamily: fonts.display, fontSize: 32, color: colors.onSurface }}>
            {naira(job.amount_paid)}
          </Text>
          <View style={{ width: 130 }}>
            <BigButton label={t("change")} icon="pencil" tone="neutral" outline compact onPress={() => setEditing(true)} testID="job-paid-change" />
          </View>
        </View>
      )}
    </Card>
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
