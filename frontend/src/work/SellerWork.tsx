import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { useSettings } from "@/src/settings";
import { shareItemOnWhatsApp } from "@/src/share";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, Card, EmptyState, ErrorView, Fab, LoadingView, Segments, Sheet, StatusPill, tap, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";

export function OfferCard({ o, onDone }: { o: any; onDone: () => void }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [counter, setCounter] = useState(false);
  const [amount, setAmount] = useState(String(o.item?.price || ""));

  const respond = async (action: "accept" | "decline" | "counter") => {
    setBusy(action);
    try {
      await api(`/marketplace/offers/${o.id}/respond`, { body: { action, counter_amount: action === "counter" ? parseInt(amount.replace(/\D/g, ""), 10) : undefined } });
      setCounter(false);
      toast.show(t("saved"));
      onDone();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card testID={`offer-card-${o.id}`}>
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
        <Image source={{ uri: o.item?.image }} style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted }}>{o.item?.name}</Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface }}>{t("offer_from", { name: o.buyer_name || "AMASS" })}</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.brandPrimary }}>{naira(o.amount)}</Text>
        </View>
      </View>
      <StatusPill status={o.status === "withdrawn" ? "buyer_cancelled" : o.status} />
      {o.status === "countered" && o.counter_amount ? (
        <Text testID={`offer-counter-amount-${o.id}`} style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.onBrandTertiary }}>
          {t("new_counter")}: {naira(o.counter_amount)}
        </Text>
      ) : null}
      {o.message ? <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: colors.onSurface }}>“{o.message}”</Text> : null}
      {o.status === "sent" ? (
        <View style={{ gap: space.sm }}>
          <BigButton label={t("accept")} icon="checkmark-circle" tone="success" onPress={() => respond("accept")} loading={busy === "accept"} testID={`offer-accept-${o.id}`} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <BigButton label={t("counter")} icon="swap-vertical" tone="gold" compact onPress={() => setCounter(true)} testID={`offer-counter-${o.id}`} />
            </View>
            <View style={{ flex: 1 }}>
              <BigButton label={t("decline")} icon="close-circle" tone="neutral" outline compact onPress={() => respond("decline")} loading={busy === "decline"} testID={`offer-decline-${o.id}`} />
            </View>
          </View>
        </View>
      ) : null}
      <Sheet visible={counter} onClose={() => setCounter(false)} title={t("new_counter")} testID="counter-sheet">
        <TextInput
          testID="counter-amount-input"
          value={amount ? naira(parseInt(amount.replace(/\D/g, ""), 10) || 0) : ""}
          onChangeText={setAmount}
          keyboardType="number-pad"
          style={{ minHeight: 72, borderRadius: radius.md, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, paddingHorizontal: space.lg, fontFamily: fonts.display, fontSize: 32, color: colors.onSurface }}
        />
        <BigButton label={t("send")} icon="send" onPress={() => respond("counter")} loading={busy === "counter"} testID="counter-send-button" />
      </Sheet>
    </Card>
  );
}

export function SellerWork({ tab }: { tab?: string }) {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const { t } = useSettings();
  const { refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [seg, setSeg] = useState<"items" | "offers">(tab === "offers" ? "offers" : "items");
  useEffect(() => {
    if (tab === "offers" || tab === "items") setSeg(tab);
  }, [tab]);
  const items = useLoad(async () => (await api<any[]>("/marketplace/my-listings")).filter((x) => x.category !== "services"));
  const offers = useLoad(async () => {
    const rank = (o: any) => (o.status === "sent" ? 0 : o.status === "countered" ? 1 : 2);
    return [...(await api<any[]>("/marketplace/offers/received"))].sort((a, b) => rank(a) - rank(b));
  });
  const cur = seg === "items" ? items : offers;
  const openOffers = (offers.data ?? []).filter((o) => o.status === "sent").length;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <Segments
          value={seg}
          onChange={setSeg}
          options={[
            { key: "items", label: t("seg_items"), icon: "pricetags" },
            { key: "offers", label: t("seg_offers"), icon: "cash", count: openOffers },
          ]}
        />
      </View>
      {cur.loading && !cur.data ? (
        <LoadingView />
      ) : cur.error && !cur.data ? (
        <ErrorView onRetry={cur.reload} />
      ) : (
        <FlatList
          data={cur.data ?? []}
          keyExtractor={(x: any) => x.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: bottomChrome + 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={cur.reload} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<EmptyState icon={seg === "items" ? "pricetags" : "cash"} text={t("empty_work")} />}
          renderItem={({ item: x }: any) =>
            seg === "items" ? (
              <Card onPress={() => router.push(`/item/${x.id}`)} testID={`item-card-${x.id}`}>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  <Image source={{ uri: x.image }} style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary }} contentFit="cover" />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface }}>{x.name}</Text>
                    <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.onSurface }}>{naira(x.price)}</Text>
                    <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                      <StatusPill status={x.status || "active"} />
                      {x.open_offers ? <StatusPill status="sent" /> : null}
                    </View>
                  </View>
                  {(x.status || "active") === "active" ? (
                    <Pressable
                      testID={`item-card-share-${x.id}`}
                      accessibilityLabel={t("share_whatsapp")}
                      onPress={() => {
                        tap();
                        shareItemOnWhatsApp(x.id).catch((e) => toast.show(e?.message || t("something_wrong"), "error"));
                      }}
                      style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
                    >
                      <Ionicons name="logo-whatsapp" size={30} color={colors.onSuccess} />
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            ) : (
              <OfferCard
                o={x}
                onDone={() => {
                  offers.reload();
                  refresh();
                }}
              />
            )
          }
        />
      )}
      {seg === "items" ? <Fab label={t("tile_add_item")} onPress={() => router.push("/item/new")} bottom={bottomChrome + 16} /> : null}
    </View>
  );
}
