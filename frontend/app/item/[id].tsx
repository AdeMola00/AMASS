import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useSettings } from "@/src/settings";
import { shareItemOnWhatsApp } from "@/src/share";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, ErrorView, LoadingView, ScreenHeader, StatusPill, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";
import { OfferCard } from "@/src/work/SellerWork";

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useSettings();
  const { refresh } = useAuth();
  const toast = useToast();
  const d = useLoad(async () => {
    const [items, offers] = await Promise.all([api<any[]>("/marketplace/my-listings"), api<any[]>("/marketplace/offers/received")]);
    return { it: items.find((x) => x.id === id), offers: offers.filter((o) => o.item_id === id) };
  }, [id]);
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = async (status: string) => {
    setBusy(status);
    try {
      await api(`/marketplace/items/${id}`, { method: "PATCH", body: { status } });
      toast.show(t("saved"));
      d.reload();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  const it = d.data?.it;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={it ? naira(it.price) : ""} guide="guide_detail" back />
      {d.loading && !d.data ? (
        <LoadingView />
      ) : !it ? (
        <ErrorView onRetry={d.reload} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
          <Image source={{ uri: it.image }} style={{ width: "100%", height: 240, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary }} contentFit="cover" />
          <StatusPill status={it.status || "active"} testID="item-status" />
          <Text style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.onSurface }}>{it.name}</Text>
          <View style={{ gap: space.sm }}>
            {it.status === "active" ? <BigButton label={t("share_whatsapp")} icon="logo-whatsapp" tone="success" onPress={() => shareItemOnWhatsApp(it.id).catch((e) => toast.show(e?.message || t("something_wrong"), "error"))} testID="item-share-whatsapp" /> : null}
            {it.status !== "active" ? <BigButton label={t("show_again")} icon="eye" tone="success" onPress={() => setStatus("active")} loading={busy === "active"} testID="item-status-active" /> : null}
            {it.status !== "sold" ? <BigButton label={t("mark_sold")} icon="pricetag" tone="dark" onPress={() => setStatus("sold")} loading={busy === "sold"} testID="item-status-sold" /> : null}
            {it.status !== "paused" ? <BigButton label={t("pause")} icon="pause-circle" tone="neutral" outline onPress={() => setStatus("paused")} loading={busy === "paused"} testID="item-status-paused" /> : null}
          </View>
          {(d.data?.offers ?? []).length ? <Text style={{ fontFamily: fonts.heavy, fontSize: 20, color: colors.onSurface }}>{t("seg_offers")}</Text> : null}
          {(d.data?.offers ?? []).map((o) => (
            <OfferCard
              key={o.id}
              o={o}
              onDone={() => {
                d.reload();
                refresh();
              }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
