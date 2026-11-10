import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fmtDay } from "@/src/format";
import { TKey } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { useSettings } from "@/src/settings";
import { fonts, space, useTheme } from "@/src/theme";
import { Avatar, BigButton, Card, EmptyState, ErrorView, LoadingView, Segments, StatusPill, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";

export const STAGE_ICON: Record<string, any> = { on_the_way: "bicycle", working: "hammer", finished: "checkmark-done-circle" };

export function FixaWork({ tab }: { tab?: string }) {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const { t, lang } = useSettings();
  const { me, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [seg, setSeg] = useState<"new" | "accepted" | "done">((tab as any) || "new");
  useEffect(() => {
    if (tab === "new" || tab === "accepted" || tab === "done") setSeg(tab);
  }, [tab]);
  const jobs = useLoad(() => api<{ items: any[] }>("/fixa/jobs"));
  const [busy, setBusy] = useState<string | null>(null);

  if (!me?.fixa) {
    return (
      <EmptyState icon="construct" text={t("pick_fixa")}>
        <View style={{ width: 260 }}>
          <BigButton label={t("join_fixa")} icon="add-circle" onPress={() => router.push("/fixa-join")} testID="fixa-join-button" />
        </View>
      </EmptyState>
    );
  }

  const all = jobs.data?.items ?? [];
  const rows = all.filter((j) => {
    const finished = j.status !== "pending" && (j.job_stage === "finished" || !["pending", "confirmed"].includes(j.status));
    return seg === "new" ? j.status === "pending" : seg === "accepted" ? j.status === "confirmed" && !finished : finished;
  });
  const act = async (j: any, action: "confirm" | "decline") => {
    setBusy(j.id + action);
    try {
      await api(`/fixa/jobs/${j.id}/${action}`, { body: {} });
      toast.show(t("saved"));
      jobs.reload();
      refresh();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <Segments
          value={seg}
          onChange={setSeg}
          options={[
            { key: "new", label: t("seg_new"), icon: "notifications", count: all.filter((j) => j.status === "pending").length },
            { key: "accepted", label: t("seg_accepted"), icon: "hammer" },
            { key: "done", label: t("seg_done"), icon: "checkmark-done" },
          ]}
        />
      </View>
      {jobs.loading && !jobs.data ? (
        <LoadingView />
      ) : jobs.error && !jobs.data ? (
        <ErrorView onRetry={jobs.reload} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: bottomChrome + space.xl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={jobs.reload} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<EmptyState icon="construct" text={t("empty_work")} />}
          renderItem={({ item: j }) => (
            <Card onPress={() => router.push(`/job/${j.id}`)} testID={`job-card-${j.id}`}>
              <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                <Avatar name={j.customer_name} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface }}>{j.customer_name}</Text>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted }}>{j.trade}</Text>
                </View>
                {j.job_stage ? <Ionicons name={STAGE_ICON[j.job_stage]} size={34} color={colors.success} /> : null}
              </View>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <Ionicons name="calendar" size={22} color={colors.brandPrimary} />
                <Text style={{ fontFamily: fonts.heavy, fontSize: 17, color: colors.onSurface }}>
                  {fmtDay(j.scheduled_date, lang)} · {j.scheduled_time}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
                <Ionicons name="location" size={22} color={colors.brandPrimary} />
                <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.onSurface }}>{j.address}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                <StatusPill status={j.job_stage === "finished" && j.status === "confirmed" ? "completed" : j.status} />
                {j.job_stage ? (
                  <View style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.successSoft }}>
                    <Text style={{ fontFamily: fonts.bold, color: colors.success }}>{t(`stage_${j.job_stage}` as TKey)}</Text>
                  </View>
                ) : null}
                {(j.job_stage === "finished" || j.status === "completed") && !j.amount_paid ? (
                  <View testID={`job-needs-price-${j.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning }}>
                    <Ionicons name="cash" size={16} color={colors.onSurface} />
                    <Text style={{ fontFamily: fonts.bold, color: colors.onSurface }}>{t("add_price")}</Text>
                  </View>
                ) : j.amount_paid ? (
                  <View style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surfaceTertiary }}>
                    <Text style={{ fontFamily: fonts.bold, color: colors.onSurface }}>{naira(j.amount_paid)}</Text>
                  </View>
                ) : null}
              </View>
              {j.status === "pending" ? (
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <BigButton label={t("accept")} icon="checkmark-circle" tone="success" compact onPress={() => act(j, "confirm")} loading={busy === j.id + "confirm"} testID={`job-accept-${j.id}`} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <BigButton label={t("decline")} icon="close-circle" tone="neutral" outline compact onPress={() => act(j, "decline")} loading={busy === j.id + "decline"} testID={`job-decline-${j.id}`} />
                  </View>
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}
