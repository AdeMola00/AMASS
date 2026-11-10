import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { TKey } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { EmptyState, ErrorView, LoadingView, ScreenHeader } from "@/src/ui";
import { useLoad } from "@/src/useLoad";

type Week = { start: string; n: number };
type Chart = { key: string; money?: boolean; weeks: Week[] };

const ICON: Record<string, any> = {
  money_sold: "cash",
  new_leads: "people",
  visits_confirmed: "calendar",
  money_won: "cash",
  offers_won: "trophy",
  offers_received: "mail-unread",
  jobs_done: "checkmark-done-circle",
  jobs_accepted: "thumbs-up",
  money_earned: "cash",
};

const short = (v: number, money?: boolean) => {
  if (!money) return String(v);
  if (v >= 1e9) return `₦${+(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `₦${+(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `₦${Math.round(v / 1e3)}k`;
  return `₦${v}`;
};

export default function Progress() {
  const { colors } = useTheme();
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const role = (params.role || auth.role || "agent") as string;
  const q = useLoad(() => api<Record<string, { charts: Chart[] }>>("/partner/trends"));
  const charts = q.data?.[role]?.charts;
  const fmt = (c: Chart, v: number) => (c.money ? naira(v) : String(v));
  const speech = (charts || []).map((c) => `${t(`m_${c.key}` as TKey)}: ${t("this_week")} ${fmt(c, c.weeks[c.weeks.length - 1].n)}`).join(". ");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={t("progress_title")} guide="guide_progress" extra={speech} back />
      {q.loading && !q.data ? (
        <LoadingView />
      ) : q.error && !q.data ? (
        <ErrorView onRetry={q.reload} />
      ) : !charts ? (
        <EmptyState icon="bar-chart" text={t("no_activity")} />
      ) : (
        <ScrollView testID="progress-screen" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.muted }}>{t("last_8_weeks")}</Text>
          {charts.map((c, i) => (
            <Animated.View key={c.key} entering={FadeInDown.delay(i * 80)}>
              <ChartCard c={c} fmt={(v) => fmt(c, v)} />
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ChartCard({ c, fmt }: { c: Chart; fmt: (v: number) => string }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const now = c.weeks[c.weeks.length - 1].n;
  const total = c.weeks.reduce((a, w) => a + w.n, 0);
  const best = Math.max(...c.weeks.map((w) => w.n));
  const max = Math.max(1, best);
  const label = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };
  return (
    <View testID={`chart-${c.key}`} style={{ borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={ICON[c.key] || "bar-chart"} size={28} color={colors.brandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface }}>{t(`m_${c.key}` as TKey)}</Text>
          <Text testID={`chart-${c.key}-now`} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.display, fontSize: 32, color: colors.onSurface }}>
            {fmt(now)}
          </Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.muted }}>{t("this_week")}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 132 }}>
        {c.weeks.map((w, i) => {
          const last = i === c.weeks.length - 1;
          return (
            <View key={w.start} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%" }}>
              {w.n ? (
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.heavy, fontSize: 11, color: colors.onSurface }}>
                  {short(w.n, c.money)}
                </Text>
              ) : null}
              <View style={{ width: "100%", height: Math.max(6, (w.n / max) * 92), borderRadius: 6, backgroundColor: last ? colors.warning : w.n ? colors.brandPrimary : colors.surfaceTertiary }} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 10, color: colors.muted }}>{label(w.start)}</Text>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Stat text={t("total_8_weeks", { n: fmt(total) })} testID={`chart-${c.key}-total`} />
        <Stat text={t("best_week", { n: fmt(best) })} />
      </View>
    </View>
  );
}

function Stat({ text, testID }: { text: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: radius.md, backgroundColor: colors.surface, padding: space.sm }}>
      <Text testID={testID} numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.onSurface }}>
        {text}
      </Text>
    </View>
  );
}
