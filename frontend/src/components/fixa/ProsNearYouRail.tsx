/**
 * Feeds · "Pros near you" — verified FIXA providers in the reader's city, free to call / WhatsApp straight from
 * the rail. Hidden when there's nothing to show so the feed never carries an empty block.
 */
import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { api, ProviderPreview } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, PressableScale, useToast } from "@/src/ui";
import { ProviderMiniCard } from "./FixaBits";

export function ProsNearYouRail({ city, gutter = space[4], refreshKey = 0 }: { city?: string | null; gutter?: number; refreshKey?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [items, setItems] = useState<ProviderPreview[]>([]);

  useEffect(() => {
    let alive = true;
    const cityKey = (city ?? "").split(" - ")[0].trim() || undefined;
    api
      .fixaProviders({ city: cityKey, verified: true, limit: 10 })
      .then(async (r) => {
        // Fall back to the whole directory when the city has no verified pros yet.
        const list = r.items.length ? r.items : cityKey ? (await api.fixaProviders({ verified: true, limit: 10 })).items : [];
        if (alive) setItems(list);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [city, refreshKey]);

  if (!items.length) return null;
  const onMissing = (what: "phone" | "whatsapp") => toast.info(what === "phone" ? "No phone number" : "No WhatsApp number", "Open the profile to book a visit instead.");

  return (
    <View style={styles.wrap} testID="fixa-pros-rail">
      <View style={[styles.head, { paddingHorizontal: gutter }]}>
        <View style={[styles.icon, { backgroundColor: colors.fixSoft }]}>
          <Ionicons name="hammer" size={14} color={colors.fixText} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="title">Pros near you</AppText>
          <AppText variant="caption" tone="tertiary">
            FIXA verified · free to call
          </AppText>
        </View>
        <PressableScale onPress={() => router.push("/fixa" as any)} accessibilityRole="button" accessibilityLabel="See all FIXA providers" testID="fixa-pros-rail-all" style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <AppText variant="caption" weight="semibold" color={colors.fixText}>
            See all
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.fixText} />
        </PressableScale>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: 10, paddingVertical: 4 }}
        renderItem={({ item }) => <ProviderMiniCard provider={item} onPress={() => router.push(`/fixa/${item.id}` as any)} onMissingContact={onMissing} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4, marginBottom: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
