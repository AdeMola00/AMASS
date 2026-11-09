import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { usesNativeTabs } from "@/src/navigation";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Card, EmptyState, ErrorView, Fab, LoadingView, StatusPill } from "@/src/ui";
import { useLoad } from "@/src/useLoad";

export function BrandWork() {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const { t } = useSettings();
  const router = useRouter();
  const p = useLoad(() => api<{ items: any[] }>("/brand/products"));

  return (
    <View style={{ flex: 1 }}>
      {p.loading && !p.data ? (
        <LoadingView />
      ) : p.error && !p.data ? (
        <ErrorView onRetry={p.reload} />
      ) : (
        <FlatList
          data={p.data?.items ?? []}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: bottomChrome + 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={p.reload} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<EmptyState icon="cube" text={t("empty_work")} />}
          renderItem={({ item: x }) => (
            <Card onPress={() => router.push(`/product/edit?id=${x.id}`)} testID={`product-card-${x.id}`}>
              <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                <Image source={{ uri: x.images?.[0] }} style={{ width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }} contentFit="contain" />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface }}>{x.name}</Text>
                  <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.onSurface }}>{naira(x.price)}</Text>
                  <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                    <StatusPill status={x.published ? x.stock_status || "in_stock" : "hidden"} />
                  </View>
                </View>
              </View>
            </Card>
          )}
        />
      )}
      <Fab label={t("tile_add_product")} onPress={() => router.push("/product/edit")} bottom={bottomChrome + 16} />
    </View>
  );
}
