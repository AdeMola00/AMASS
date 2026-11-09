import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ago } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { useSettings } from "@/src/settings";
import { fonts, space, useTheme } from "@/src/theme";
import { Avatar, Card, EmptyState, ErrorView, LoadingView, ScreenHeader, Segments } from "@/src/ui";
import { useLoad } from "@/src/useLoad";

export default function Messages() {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const { t } = useSettings();
  const { kind } = useAuth();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [seg, setSeg] = useState<"chats" | "alerts">(tab === "alerts" ? "alerts" : "chats");
  useEffect(() => {
    if (tab === "alerts" || tab === "chats") setSeg(tab);
  }, [tab]);
  const brand = kind === "brand";
  const chats = useLoad(() => (brand ? Promise.resolve({ items: [] }) : api<{ items: any[] }>("/chat/conversations")), [brand]);
  const alerts = useLoad(() => (brand ? Promise.resolve({ items: [] }) : api<{ items: any[] }>("/notifications/center?limit=40")), [brand]);
  const cur = seg === "chats" ? chats : alerts;
  const unreadChats = (chats.data?.items ?? []).filter((c) => c.unread_count).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={t("tab_messages")} guide="guide_messages" />
      {brand ? (
        <EmptyState icon="mail" text={t("brand_no_chat")} />
      ) : (
        <>
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
            <Segments
              value={seg}
              onChange={setSeg}
              options={[
                { key: "chats", label: t("seg_chats"), icon: "chatbubbles", count: unreadChats },
                { key: "alerts", label: t("seg_alerts"), icon: "megaphone" },
              ]}
            />
          </View>
          {cur.loading && !cur.data ? (
            <LoadingView />
          ) : cur.error && !cur.data ? (
            <ErrorView onRetry={cur.reload} />
          ) : (
            <FlatList
              data={cur.data?.items ?? []}
              keyExtractor={(x: any) => x.id}
              contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: bottomChrome + space.xl }}
              refreshControl={<RefreshControl refreshing={false} onRefresh={cur.reload} tintColor={colors.brandPrimary} />}
              ListEmptyComponent={<EmptyState icon={seg === "chats" ? "chatbubbles" : "megaphone"} text={seg === "chats" ? t("no_messages") : t("no_alerts")} />}
              renderItem={({ item: x }: any) => {
                if (seg === "alerts")
                  return (
                    <Card testID={`alert-row-${x.id}`} style={{ flexDirection: "row", alignItems: "center", backgroundColor: x.read ? colors.surfaceSecondary : colors.brandTertiary }}>
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="notifications" size={26} color={colors.onSurface} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface }}>{x.title}</Text>
                        <Text numberOfLines={2} style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted }}>{x.body}</Text>
                      </View>
                      <Text style={{ fontFamily: fonts.medium, color: colors.muted }}>{ago(x.created_at)}</Text>
                    </Card>
                  );
                const other = x.other_participants?.[0];
                const about = x.property?.title || x.item?.name;
                return (
                  <Card onPress={() => router.push(`/chat/${x.id}`)} testID={`chat-row-${x.id}`} style={{ flexDirection: "row", alignItems: "center" }}>
                    <Avatar name={other?.full_name} uri={other?.avatar_url} size={60} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface }}>{other?.full_name || "AMASS"}</Text>
                      {about ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name={x.property ? "home" : "pricetag"} size={15} color={colors.muted} />
                          <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.muted }}>{about}</Text>
                        </View>
                      ) : null}
                      <Text numberOfLines={1} style={{ fontFamily: x.unread_count ? fonts.bold : fonts.medium, fontSize: 16, color: colors.onSurface }}>{x.last_message_preview}</Text>
                    </View>
                    {x.unread_count ? (
                      <View style={{ minWidth: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
                        <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.onBrandPrimary }}>{x.unread_count}</Text>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={26} color={colors.muted} />
                    )}
                  </Card>
                );
              }}
            />
          )}
        </>
      )}
    </View>
  );
}
