import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { api, naira } from "@/src/api";
import { Role } from "@/src/auth";
import { TKey } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { SpeakButton } from "@/src/ui";

type Metric = { key: string; now: number; prev: number | null; money?: boolean };
type Block = { metrics: Metric[]; series_key: string; series: { day: string; n: number }[] };

const ICON: Record<string, any> = {
  homes_sold: "pricetag",
  new_leads: "people",
  visits_confirmed: "calendar",
  offers_won: "trophy",
  money_won: "cash",
  offers_received: "mail-unread",
  jobs_done: "checkmark-done-circle",
  jobs_accepted: "thumbs-up",
  rating: "star",
};

// Simple weekly picture: one big hero number, two small ones, and 7 bars (no chart library).
export function WeekCard({ role }: { role: Role }) {
  const { colors } = useTheme();
  const { t, lang } = useSettings();
  const [data, setData] = useState<Record<string, Block> | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Record<string, Block>>("/partner/summary")
        .then(setData)
        .catch(() => {});
    }, []),
  );

  const b = data?.[role];
  if (!b) return null;
  const [hero, ...rest] = b.metrics;
  const fmt = (m: Metric) => (m.money ? naira(m.now) : m.key === "rating" ? (m.now ? `${m.now}★` : "–") : String(m.now));
  const max = Math.max(1, ...b.series.map((x) => x.n));
  const speech = b.metrics.map((m) => `${t(`m_${m.key}` as TKey)}: ${fmt(m).replace("★", "")}`).join(". ");
  const dayLetter = (iso: string) => {
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString(lang === "en" || lang === "pcm" ? "en-NG" : `${lang}-NG`, { weekday: "short" }).slice(0, 2);
    } catch {
      return iso.slice(8);
    }
  };

  return (
    <View testID="week-card" style={{ borderRadius: radius.lg, backgroundColor: colors.surfaceInverse, padding: space.lg, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Ionicons name="bar-chart" size={24} color={colors.warning} />
        <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurfaceInverse }}>{t("this_week")}</Text>
        <SpeakButton guide="guide_summary" extra={speech} testID="week-speak-button" />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={ICON[hero.key]} size={34} color={colors.onSurfaceInverse} />
        </View>
        <View style={{ flex: 1 }}>
          <Text testID={`week-metric-${hero.key}`} style={{ fontFamily: fonts.display, fontSize: 48, lineHeight: 54, color: colors.onSurfaceInverse }}>
            {fmt(hero)}
          </Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.onSurfaceInverse }}>{t(`m_${hero.key}` as TKey)}</Text>
          {hero.prev != null ? <Trend now={hero.now} prev={hero.prev} money={hero.money} /> : null}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        {rest.map((m) => (
          <View key={m.key} style={{ flex: 1, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.08)", padding: space.md, gap: 4 }}>
            <Ionicons name={ICON[m.key]} size={24} color={colors.warning} />
            <Text testID={`week-metric-${m.key}`} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.display, fontSize: 28, color: colors.onSurfaceInverse }}>
              {fmt(m)}
            </Text>
            <Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.onSurfaceInverse, opacity: 0.85 }}>{t(`m_${m.key}` as TKey)}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.onSurfaceInverse, opacity: 0.75 }}>
          {t(`m_${b.series_key}` as TKey)} · {t("last_7_days")}
        </Text>
        <View testID="week-bars" style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 84 }}>
          {b.series.map((d, i) => (
            <View key={d.day} style={{ flex: 1, alignItems: "center", gap: 4, justifyContent: "flex-end", height: "100%" }}>
              {d.n ? <Text style={{ fontFamily: fonts.heavy, fontSize: 12, color: colors.onSurfaceInverse }}>{d.n}</Text> : null}
              <View style={{ width: "100%", height: Math.max(6, (d.n / max) * 56), borderRadius: 6, backgroundColor: i === b.series.length - 1 ? colors.warning : d.n ? colors.brandPrimary : "rgba(255,255,255,0.15)" }} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: colors.onSurfaceInverse, opacity: 0.7 }}>{dayLetter(d.day)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Trend({ now, prev, money }: { now: number; prev: number; money?: boolean }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const up = now > prev;
  const same = now === prev;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
      <Ionicons name={same ? "remove" : up ? "arrow-up" : "arrow-down"} size={18} color={same ? colors.onSurfaceInverse : up ? colors.success : colors.brandPrimary} />
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceInverse, opacity: 0.8 }}>{t("vs_last_week", { n: money ? naira(prev) : prev })}</Text>
    </View>
  );
}
