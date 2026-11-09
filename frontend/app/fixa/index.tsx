import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ProviderPreview } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { Appear, AppText, EmptyState, Input, Screen, ScreenHeader, SkeletonRows, Tile, useToast } from "@/src/ui";
import { ProviderRow, tradeIcon } from "@/src/components/fixa/FixaBits";
import { FixaIntro } from "@/src/components/intro/FixaIntro";
import { useOnceIntro } from "@/src/components/intro/sectionIntro";

/**
 * FIXA directory — free for everyone. Verified pros only (new applicants stay hidden until AMASS Admin approves),
 * phone + WhatsApp on every row. Pros join and manage their profile in the separate AMASS Agent app.
 */
export default function FixaBrowse() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const [items, setItems] = useState<ProviderPreview[]>([]);
  const [subs, setSubs] = useState<string[]>([]);
  const [sub, setSub] = useState<string | null>(params.category ?? null);
  const [query, setQuery] = useState(params.q ?? "");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fixaIntro = useOnceIntro("fixa", true); // 1 s FIXA moment, first time this session

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.fixaProviders({ q: query.trim() || undefined, subcategory: sub ?? undefined, verified: verifiedOnly || undefined, limit: 80 });
      setItems(res.items);
      setSubs(res.subcategories);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load FIXA providers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, sub, verifiedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const subtitle = useMemo(() => (loading ? "Vetted home pros" : `${items.length} pros · free to contact`), [loading, items.length]);
  const onMissing = (what: "phone" | "whatsapp") => toast.info(what === "phone" ? "No phone number" : "No WhatsApp number", "This provider hasn't added one yet — book a visit instead.");

  return (
    <Screen testID="fixa-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="FIXA" subtitle={subtitle} />
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 40 + insets.bottom, gap: space[3] }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.text}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: space[3] }}>
            <Input placeholder="Search a trade or name" value={query} onChangeText={setQuery} iconLeft="search" returnKeyType="search" onSubmitEditing={load} testID="fixa-search" />
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={["__verified", ...subs]}
              keyExtractor={(s) => s}
              contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
              renderItem={({ item: s }) =>
                s === "__verified" ? (
                  <Tile icon="shield-checkmark" label="Verified" color={colors.fix} size="sm" selected={verifiedOnly} onPress={() => setVerifiedOnly((v) => !v)} testID="fixa-chip-verified" />
                ) : (
                  <Tile icon={tradeIcon(s)} label={s} color={colors.fix} size="sm" selected={sub === s} onPress={() => setSub(sub === s ? null : s)} testID={`fixa-sub-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} />
                )
              }
            />
            <View style={styles.noteRow} accessibilityRole="summary" accessibilityLabel="FIXA is free. Call or WhatsApp any pro, book a visit, rate the job.">
              <Note icon="call" label="Call or WhatsApp free" />
              <Note icon="calendar" label="Book without paying" />
              <Note icon="star" label="Rate after the job" />
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonRows rows={5} />
          ) : error ? (
            <EmptyState variant="error" title={error} body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="fixa-error" />
          ) : (
            <EmptyState
              icon="construct-outline"
              title={sub ? `No ${sub} pros yet` : "No pros match"}
              body={sub ? "We're still onboarding this trade. Browse every verified pro or search by name instead." : "Try another trade or clear the filters."}
              actionLabel={sub ? "Show all pros" : "Clear"}
              actionIcon={sub ? "people-outline" : "close-circle-outline"}
              onAction={() => {
                setSub(null);
                setQuery("");
                setVerifiedOnly(false);
              }}
              testID="fixa-empty"
            />
          )
        }
        renderItem={({ item, index }) => (
          <Appear index={index}>
            <ProviderRow provider={item} onPress={() => router.push(`/fixa/${item.id}` as any)} onMissingContact={onMissing} />
          </Appear>
        )}
      />
      {fixaIntro.show && <FixaIntro onDone={fixaIntro.done} />}
    </Screen>
  );
}

function Note({ icon, label }: { icon: any; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: colors.fixSoft }]}>
      <Ionicons name={icon} size={14} color={colors.fixText} />
      <AppText variant="caption" color={colors.fixText}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 32, borderRadius: radii.pill },
  noteRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
