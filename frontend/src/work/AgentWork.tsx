import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fmtDay, fmtTime } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { useSettings } from "@/src/settings";
import { shareListingOnWhatsApp } from "@/src/share";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Avatar, BigButton, Card, EmptyState, ErrorView, Fab, LoadingView, Segments, Sheet, StatusPill, tap, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";

export function AgentWork({ tab }: { tab?: string }) {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const { t, lang } = useSettings();
  const { refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [seg, setSeg] = useState<"homes" | "visits">(tab === "visits" ? "visits" : "homes");
  useEffect(() => {
    if (tab === "visits" || tab === "homes") setSeg(tab);
  }, [tab]);

  const homes = useLoad(() => api<{ listings: any[] }>("/agent/manager"));
  const visits = useLoad(() => api<{ upcoming: any[]; past: any[]; pending_for_me: number }>("/viewings/mine?role=agent"));
  const [propose, setPropose] = useState<any>(null);
  const [day, setDay] = useState(1);
  const [slot, setSlot] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (v: any, action: "confirm" | "decline") => {
    setBusy(v.id + action);
    try {
      await api(`/viewings/${v.id}/${action}`, { body: {} });
      toast.show(t("saved"));
      visits.reload();
      refresh();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  const sendPropose = async () => {
    const d = new Date();
    d.setDate(d.getDate() + day);
    d.setHours(slot, 0, 0, 0);
    setBusy("propose");
    try {
      await api(`/viewings/${propose.id}/propose`, { body: { start: d.toISOString() } });
      setPropose(null);
      toast.show(t("saved"));
      visits.reload();
      refresh();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  const listRows = seg === "homes" ? homes.data?.listings ?? [] : [...(visits.data?.upcoming ?? []), ...(visits.data?.past ?? [])];
  const cur = seg === "homes" ? homes : visits;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <Segments
          value={seg}
          onChange={setSeg}
          options={[
            { key: "homes", label: t("seg_homes"), icon: "home" },
            { key: "visits", label: t("seg_visits"), icon: "calendar", count: visits.data?.pending_for_me },
          ]}
        />
      </View>
      {cur.loading && !cur.data ? (
        <LoadingView />
      ) : cur.error && !cur.data ? (
        <ErrorView onRetry={cur.reload} />
      ) : (
        <FlatList
          data={listRows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: bottomChrome + 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={cur.reload} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<EmptyState icon={seg === "homes" ? "home" : "calendar"} text={t("empty_work")} />}
          renderItem={({ item: x }) =>
            seg === "homes" ? (
              <Card onPress={() => router.push(`/listing/${x.id}`)} testID={`listing-card-${x.id}`} style={{ padding: 0, overflow: "hidden", gap: 0 }}>
                <Image source={{ uri: x.cover }} style={{ width: "100%", height: 170, backgroundColor: colors.surfaceTertiary }} contentFit="cover" />
                <View style={{ padding: space.lg, gap: space.sm }}>
                  <StatusPill status={x.status} />
                  <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.onSurface }}>{naira(x.price)}</Text>
                  <Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface }}>{x.title}</Text>
                  <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
                    <Stat icon="eye" n={x.views_total} />
                    <Stat icon="people" n={x.leads?.total} hot={!!x.leads?.total_30d} />
                    <Stat icon="heart" n={x.saves} />
                    <View style={{ flex: 1 }} />
                    <Pressable
                      testID={`listing-card-share-${x.id}`}
                      accessibilityLabel={t("share_whatsapp")}
                      onPress={() => {
                        tap();
                        shareListingOnWhatsApp(x.id).catch((e) => toast.show(e?.message || t("something_wrong"), "error"));
                      }}
                      style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
                    >
                      <Ionicons name="logo-whatsapp" size={30} color={colors.onSuccess} />
                    </Pressable>
                  </View>
                </View>
              </Card>
            ) : (
              <Card testID={`visit-card-${x.id}`}>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  <Avatar name={x.buyer?.full_name} uri={x.buyer?.avatar_url} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface }}>{t("wants_visit", { name: x.buyer?.full_name || "AMASS" })}</Text>
                    <StatusPill status={x.status} />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  <Image source={{ uri: x.property_image }} style={{ width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted }}>{x.property_title}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="calendar" size={22} color={colors.brandPrimary} />
                      <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurface }}>
                        {fmtDay(x.start, lang)} · {fmtTime(x.start)}
                      </Text>
                    </View>
                  </View>
                </View>
                {x.note ? <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: colors.onSurface }}>“{x.note}”</Text> : null}
                {x.can_confirm ? (
                  <View style={{ gap: space.sm }}>
                    <BigButton label={t("accept")} icon="checkmark-circle" tone="success" onPress={() => act(x, "confirm")} loading={busy === x.id + "confirm"} testID={`visit-accept-${x.id}`} />
                    <View style={{ flexDirection: "row", gap: space.sm }}>
                      <View style={{ flex: 1 }}>
                        <BigButton label={t("another_time")} icon="time" tone="gold" compact onPress={() => setPropose(x)} testID={`visit-propose-${x.id}`} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <BigButton label={t("decline")} icon="close-circle" tone="neutral" outline compact onPress={() => act(x, "decline")} loading={busy === x.id + "decline"} testID={`visit-decline-${x.id}`} />
                      </View>
                    </View>
                  </View>
                ) : null}
              </Card>
            )
          }
        />
      )}
      {seg === "homes" ? <Fab label={t("tile_new_listing")} onPress={() => router.push("/listing/new")} bottom={bottomChrome + 16} /> : null}

      <Sheet visible={!!propose} onClose={() => setPropose(null)} title={t("another_time")} testID="propose-sheet">
        <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface }}>{t("pick_day")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const dt = new Date();
            dt.setDate(dt.getDate() + d);
            return <Choice key={d} on={day === d} label={d === 1 ? t("tomorrow") : fmtDay(dt.toISOString(), lang)} onPress={() => setDay(d)} testID={`propose-day-${d}`} />;
          })}
        </View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface }}>{t("pick_time")}</Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {[
            { h: 10, k: "morning", ic: "sunny" },
            { h: 13, k: "afternoon", ic: "partly-sunny" },
            { h: 16, k: "evening", ic: "moon" },
          ].map((o) => (
            <Choice key={o.h} on={slot === o.h} label={`${t(o.k as any)}\n${o.h > 12 ? o.h - 12 : o.h}:00 ${o.h >= 12 ? "pm" : "am"}`} icon={o.ic} onPress={() => setSlot(o.h)} testID={`propose-time-${o.k}`} flex />
          ))}
        </View>
        <BigButton label={t("send")} icon="send" onPress={sendPropose} loading={busy === "propose"} testID="propose-send-button" />
      </Sheet>
    </View>
  );
}

function Stat({ icon, n, hot }: { icon: any; n?: number; hot?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Ionicons name={icon} size={22} color={hot ? colors.brandPrimary : colors.muted} />
      <Text style={{ fontFamily: fonts.heavy, fontSize: 17, color: hot ? colors.brandPrimary : colors.onSurface }}>{n ?? 0}</Text>
    </View>
  );
}

export function Choice({ on, label, onPress, testID, icon, flex }: { on: boolean; label: string; onPress: () => void; testID: string; icon?: any; flex?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        tap();
        onPress();
      }}
      style={{ flex: flex ? 1 : undefined, minHeight: 56, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandSecondary : colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 4 }}
    >
      {icon ? <Ionicons name={icon} size={24} color={on ? colors.brandPrimary : colors.onSurface} /> : null}
      <Text style={{ fontFamily: fonts.bold, fontSize: 15, textAlign: "center", color: on ? colors.brandPrimary : colors.onSurface }}>{label}</Text>
    </Pressable>
  );
}
