/**
 * Property picker — choose which home an improvement (inspection → finance → renovation) is about.
 * Saved homes first, then a live search over all AMASS listings. Tapping a row opens /improve/request/[propertyId].
 */
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { api, type Property } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, EmptyState, Input, ListRow, RowGroup, Screen, ScreenHeader, SkeletonRows } from "@/src/ui";

const fmtPrice = (p: Property) => `₦${Number(p.price ?? 0).toLocaleString()}${p.listing_type === "rent" ? "/yr" : p.listing_type === "shortlet" ? "/night" : ""}`;

function Thumb({ uri }: { uri?: string }) {
  const { colors } = useTheme();
  return <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} /> : null}</View>;
}

export default function PropertyPicker() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<Property[] | null>(null);
  const [results, setResults] = useState<Property[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .listFavorites()
      .then(setSaved)
      .catch(() => {
        setSaved([]);
        setError(true);
      });
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      api
        .listProperties({ q: term, limit: 25 })
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const open = (p: Property) => router.push(`/improve/request/${p.id}` as any);
  const rows = useMemo(() => (results !== null ? results : saved ?? []), [results, saved]);
  const title = results !== null ? "Search results" : "Your saved homes";

  return (
    <Screen testID="property-picker-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Which property?" subtitle="Pick the home this improvement is about" onBack={() => (router.canGoBack() ? router.back() : router.replace("/improve" as any))} />
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <Input value={q} onChangeText={setQ} placeholder="Search by title, area or city" iconLeft="search" returnKeyType="search" autoCorrect={false} testID="picker-search" />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <AppText variant="label" tone="tertiary" uppercase style={{ marginBottom: 8 }}>
            {title}
          </AppText>
        }
        renderItem={({ item, index }) => (
          <RowGroup>
            <ListRow leading={<Thumb uri={item.images?.[0]} />} label={item.title} caption={`${[item.location, item.city].filter(Boolean).join(", ")} · ${fmtPrice(item)}`} onPress={() => open(item)} last testID={`picker-row-${index}`} />
          </RowGroup>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          saved === null || searching ? (
            <SkeletonRows rows={4} />
          ) : results !== null ? (
            <EmptyState icon="search-outline" compact title="No homes match" body="Try a different area, city or listing title." />
          ) : (
            <EmptyState icon="heart-outline" title={error ? "Couldn't load your saved homes" : "No saved homes yet"} body="Search above for any AMASS listing, or save homes from Find Home and they'll appear here." actionLabel="Browse Find Home" onAction={() => router.replace("/(tabs)" as any)} testID="picker-empty" />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space[4], paddingBottom: 48 },
  thumb: { width: 44, height: 44, borderRadius: radii.md, overflow: "hidden" },
});
