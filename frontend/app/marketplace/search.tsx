import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, SearchSuggestions } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, spacing, formatNaira } from "@/src/constants/theme";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";

const RECENTS_KEY = "amass_market_recents";

export default function MarketSearch() {
  const router = useRouter();
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
        const s = await api.marketplaceSuggestions("");
        setSuggest(s);
      } catch {}
    })();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const runSuggest = useCallback((query: string) => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      try {
        const s = await api.marketplaceSuggestions(query);
        setSuggest(s);
      } catch {}
    }, 220);
  }, []);

  const onChangeText = (t: string) => {
    setQ(t);
    setResults(null);
    if (t.trim().length === 0) {
      runSuggest("");
    } else {
      runSuggest(t);
    }
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.searchHeader}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="search-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={17} color={colors.textSecondary} />
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={onChangeText}
            onSubmitEditing={() => submitSearch()}
            placeholder="Search phones, cars, homes…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            testID="search-input"
          />
          {q.length > 0 && (
            <Pressable onPress={() => { setQ(""); setResults(null); runSuggest(""); }} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} />
        </View>
      ) : results !== null ? (
        results.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search" size={30} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No results for "{q}"</Text>
            <Text style={styles.emptyBody}>Try a different spelling, category or brand.</Text>
          </View>
        ) : (
          <FlatList
            data={gridRows}
            keyExtractor={(_, i) => `row-${i}`}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, gap: 12, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <Text style={styles.resultsHead}>
                {results.length} result{results.length === 1 ? "" : "s"}
              </Text>
            }
            renderItem={({ item: row }) => (
              <View style={styles.gridRow}>
                {row.map((it) => (
                  <ClassifiedCard
                    key={it.id}
                    item={it}
                    variant="grid"
                    onPress={() => router.push(`/marketplace/${it.id}` as any)}
                  />
                ))}
                {row.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            )}
          />
        )
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Item matches (from suggestions) */}
          {suggest?.items && suggest.items.length > 0 && (
            <Block title="Matches">
              {suggest.items.map((it) => (
                <Pressable
                  key={it.id}
                  style={styles.suggestItem}
                  onPress={() => router.push(`/marketplace/${it.id}` as any)}
                >
                  <Image source={{ uri: it.image }} style={styles.suggestThumb} contentFit="cover" transition={150} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={styles.suggestTitle}>{it.name}</Text>
                    <Text style={styles.suggestPrice}>{formatNaira(it.price)}{it.city ? ` · ${it.city}` : ""}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ))}
            </Block>
          )}

          {/* Recent searches */}
          {recents.length > 0 && q.length === 0 && (
            <Block
              title="Recent"
              action={<Pressable onPress={clearRecents}><Text style={styles.linkText}>Clear</Text></Pressable>}
            >
              <View style={styles.chipsWrap}>
                {recents.map((r) => (
                  <SuggestChip key={r} label={r} icon="time-outline" onPress={() => submitSearch(r)} />
                ))}
              </View>
            </Block>
          )}

          {/* Trending */}
          {suggest?.trending && suggest.trending.length > 0 && (
            <Block title="Trending">
              <View style={styles.chipsWrap}>
                {suggest.trending.map((t) => (
                  <SuggestChip key={t} label={t} icon="trending-up" onPress={() => submitSearch(t)} />
                ))}
              </View>
            </Block>
          )}

          {/* Popular brands */}
          {suggest?.brands && suggest.brands.length > 0 && (
            <Block title="Popular brands">
              <View style={styles.chipsWrap}>
                {suggest.brands.map((b) => (
                  <SuggestChip key={b} label={b} icon="ribbon-outline" onPress={() => submitSearch(b)} />
                ))}
              </View>
            </Block>
          )}

          {/* Categories */}
          {suggest?.categories && suggest.categories.length > 0 && (
            <Block title="Browse categories">
              <View style={styles.chipsWrap}>
                {suggest.categories.map((c) => (
                  <SuggestChip key={c} label={c} icon="apps-outline" onPress={() => submitSearch(c)} />
                ))}
              </View>
            </Block>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={styles.blockTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function SuggestChip({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    paddingTop: 4,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, fontWeight: "500" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  block: { paddingHorizontal: spacing.lg, paddingTop: 14 },
  blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  blockTitle: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.6, textTransform: "uppercase" },
  linkText: { fontSize: 12, fontWeight: "800", color: colors.red },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.text },

  suggestItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  suggestThumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: colors.surfaceSecondary },
  suggestTitle: { fontSize: 13, fontWeight: "600", color: colors.text, lineHeight: 17 },
  suggestPrice: { fontSize: 11, color: colors.textTertiary, fontWeight: "700", marginTop: 2 },

  resultsHead: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  gridRow: { flexDirection: "row", gap: 12 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: 8 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  emptyBody: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },
});
