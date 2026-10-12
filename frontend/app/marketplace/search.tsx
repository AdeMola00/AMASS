import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, ScrollView, FlatList } from "react-native";
import { Image } from "expo-image";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, SearchSuggestions } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { fontFamilies, radii, space } from "@/src/theme/tokens";
import { AppText, Chip, EmptyState, IconButton, Screen, SkeletonCard } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";

const RECENTS_KEY = "amass_market_recents";

export default function MarketSearch() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<SearchSuggestions | null>(null);
  const [results, setResults] = useState<MarketplaceItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recents on mount
  useEffect(() => {
    (async () => {
      const r = await storage.getItem<string[]>(RECENTS_KEY, []);
      if (Array.isArray(r)) setRecents(r);
      // fetch cold-start suggestions
      try {
        setSuggest(await api.marketplaceSuggestions(""));
      } catch {}
    })();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const runSuggest = useCallback((query: string) => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      try {
        setSuggest(await api.marketplaceSuggestions(query));
      } catch {}
    }, 220);
  }, []);

  const onChangeText = (t: string) => {
    setQ(t);
    setResults(null);
    runSuggest(t.trim().length === 0 ? "" : t);
  };

  const submitSearch = async (raw?: string) => {
    const text = (raw ?? q).trim();
    if (!text) return;
    Haptics.selectionAsync().catch(() => {});
    setLoading(true);
    setQ(text);
    try {
      const list = await api.marketplace({ q: text, limit: 60 });
      setResults(list);
      const next = [text, ...recents.filter((r) => r.toLowerCase() !== text.toLowerCase())].slice(0, 8);
      setRecents(next);
      storage.setItem(RECENTS_KEY, next);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const clearRecents = () => {
    setRecents([]);
    storage.setItem(RECENTS_KEY, []);
  };

  const gridRows: MarketplaceItem[][] = [];
  if (results) for (let i = 0; i < results.length; i += 2) gridRows.push(results.slice(i, i + 2));

  return (
    <Screen testID="market-search-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.searchHeader}>
        <IconButton icon="chevron-back" label="Go back" onPress={() => router.back()} testID="search-back" size={40} />
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.textSecondary} />
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={onChangeText}
            onSubmitEditing={() => submitSearch()}
            placeholder="Search phones, cars, homes…"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            accessibilityLabel="Search the market"
            testID="search-input"
          />
          {q.length > 0 ? (
            <Pressable
              onPress={() => {
                setQ("");
                setResults(null);
                runSuggest("");
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={{ padding: space[4], gap: 12 }}>
          <View style={styles.gridRow}>
            <SkeletonCard imageHeight={140} style={{ flex: 1 }} />
            <SkeletonCard imageHeight={140} style={{ flex: 1 }} />
          </View>
          <View style={styles.gridRow}>
            <SkeletonCard imageHeight={140} style={{ flex: 1 }} />
            <SkeletonCard imageHeight={140} style={{ flex: 1 }} />
          </View>
        </View>
      ) : results !== null ? (
        results.length === 0 ? (
          <EmptyState icon="search-outline" title={`No results for “${q}”`} body="Try a different spelling, category or brand." actionLabel="Clear search" onAction={() => { setQ(""); setResults(null); runSuggest(""); }} testID="search-empty" />
        ) : (
          <FlatList
            data={gridRows}
            keyExtractor={(_, i) => `row-${i}`}
            contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 40 + insets.bottom, gap: 12, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <AppText variant="caption" tone="secondary" weight="semibold" tabular style={{ marginBottom: 2 }}>
                {results.length} result{results.length === 1 ? "" : "s"}
              </AppText>
            }
            renderItem={({ item: row }) => (
              <View style={styles.gridRow}>
                {row.map((it) => (
                  <ClassifiedCard key={it.id} item={it} variant="grid" onPress={() => router.push(`/marketplace/${it.id}` as any)} />
                ))}
                {row.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            )}
          />
        )
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
          {/* Item matches (from suggestions) */}
          {suggest?.items && suggest.items.length > 0 ? (
            <Block title="Matches">
              <View style={[styles.matchGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {suggest.items.map((it, i) => (
                  <Pressable
                    key={it.id}
                    style={({ pressed }) => [
                      styles.suggestItem,
                      i < suggest.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                      pressed && { backgroundColor: colors.surfaceAlt },
                    ]}
                    onPress={() => router.push(`/marketplace/${it.id}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`${it.name}, ${formatNaira(it.price)}`}
                  >
                    <Image source={{ uri: it.image }} style={[styles.suggestThumb, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={150} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodySm" weight="medium" numberOfLines={2}>
                        {it.name}
                      </AppText>
                      <AppText variant="caption" tone="tertiary" tabular>
                        {formatNaira(it.price)}
                        {it.city ? ` · ${it.city}` : ""}
                      </AppText>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            </Block>
          ) : null}

          {recents.length > 0 && q.length === 0 ? (
            <Block title="Recent" actionLabel="Clear" onAction={clearRecents}>
              <ChipWrap items={recents} icon="time-outline" onPress={submitSearch} />
            </Block>
          ) : null}

          {suggest?.trending && suggest.trending.length > 0 ? (
            <Block title="Trending">
              <ChipWrap items={suggest.trending} icon="trending-up" onPress={submitSearch} />
            </Block>
          ) : null}

          {suggest?.brands && suggest.brands.length > 0 ? (
            <Block title="Popular brands">
              <ChipWrap items={suggest.brands} icon="ribbon-outline" onPress={submitSearch} />
            </Block>
          ) : null}

          {suggest?.categories && suggest.categories.length > 0 ? (
            <Block title="Browse categories">
              <ChipWrap items={suggest.categories} icon="apps-outline" onPress={submitSearch} />
            </Block>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

function Block({ title, actionLabel, onAction, children }: { title: string; actionLabel?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.block}>
      <View style={styles.blockHead}>
        <AppText variant="label" tone="tertiary" uppercase>
          {title}
        </AppText>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
            <AppText variant="caption" weight="bold" tone="brand">
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {children}
    </Animated.View>
  );
}

function ChipWrap({ items, icon, onPress }: { items: string[]; icon: IconName; onPress: (v: string) => void }) {
  return (
    <View style={styles.chipsWrap}>
      {items.map((label) => (
        <Chip key={label} label={label} icon={icon} onPress={() => onPress(label)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  searchHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: space[4], paddingVertical: space[2] },
  searchBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 46, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fontFamilies.medium, height: "100%", paddingVertical: 0 },
  block: { paddingHorizontal: space[4], paddingTop: space[4] },
  blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingHorizontal: 4 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  matchGroup: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  suggestItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 60 },
  suggestThumb: { width: 46, height: 46, borderRadius: radii.xs },
  gridRow: { flexDirection: "row", gap: 12 },
});
