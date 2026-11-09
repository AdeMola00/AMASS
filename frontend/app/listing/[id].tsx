import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { ago } from "@/src/format";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Avatar, BigButton, Card, ErrorView, LoadingView, ScreenHeader, StatusPill, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useSettings();
  const router = useRouter();
  const toast = useToast();
  const d = useLoad(async () => {
    const [m, leads] = await Promise.all([api<{ listings: any[] }>("/agent/manager"), api<{ leads: any[] }>(`/agent/listings/${id}/leads`)]);
    return { p: m.listings.find((x) => x.id === id), leads: leads.leads };
  }, [id]);
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = async (status: string) => {
    setBusy(status);
    try {
      await api(`/agent/listings/${id}/status`, { method: "PATCH", body: { status } });
      toast.show(t("saved"));
      d.reload();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  const p = d.data?.p;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={p ? naira(p.price) : ""} guide="guide_detail" back />
      {d.loading && !d.data ? (
        <LoadingView />
      ) : !p ? (
        <ErrorView onRetry={d.reload} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
          <Image source={{ uri: p.cover }} style={{ width: "100%", height: 220, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary }} contentFit="cover" />
          <View style={{ gap: space.sm }}>
            <StatusPill status={p.status} testID="listing-status" />
            <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.onSurface }}>{p.title}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: space.md }}>
            {[
              { icon: "eye", n: p.views_total, label: t("views") },
              { icon: "people", n: p.leads?.total, label: t("people_interested") },
            ].map((x) => (
              <Card key={x.icon} style={{ flex: 1, alignItems: "center" }}>
                <Ionicons name={x.icon as any} size={30} color={colors.brandPrimary} />
                <Text style={{ fontFamily: fonts.display, fontSize: 32, color: colors.onSurface }}>{x.n ?? 0}</Text>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.muted, textAlign: "center" }}>{x.label}</Text>
              </Card>
            ))}
          </View>
          <View style={{ gap: space.sm }}>
            {p.status !== "available" ? <BigButton label={t("show_again")} icon="eye" tone="success" onPress={() => setStatus("available")} loading={busy === "available"} testID="listing-status-available" /> : null}
            {p.status !== "sold" ? <BigButton label={t("mark_sold")} icon="pricetag" tone="dark" onPress={() => setStatus("sold")} loading={busy === "sold"} testID="listing-status-sold" /> : null}
            {p.status !== "withdrawn" ? <BigButton label={t("hide")} icon="eye-off" tone="neutral" outline onPress={() => setStatus("withdrawn")} loading={busy === "withdrawn"} testID="listing-status-hide" /> : null}
          </View>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 20, color: colors.onSurface }}>{t("people_interested")}</Text>
          {(d.data?.leads ?? []).length === 0 ? <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: colors.muted }}>{t("empty_work")}</Text> : null}
          {(d.data?.leads ?? []).map((l) => (
            <Card key={l.id} testID={`lead-row-${l.id}`} onPress={l.conversation_id ? () => router.push(`/chat/${l.conversation_id}`) : undefined} style={{ flexDirection: "row", alignItems: "center" }}>
              <Avatar name={l.name} uri={l.avatar} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface }}>{l.name}</Text>
                <Text numberOfLines={2} style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted }}>{l.detail}</Text>
              </View>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Ionicons name={l.kind === "chat" ? "chatbubbles" : l.kind === "inspection" ? "calendar" : "lock-open"} size={26} color={colors.brandPrimary} />
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted }}>{ago(l.at)}</Text>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
