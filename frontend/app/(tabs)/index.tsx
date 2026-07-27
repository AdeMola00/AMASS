import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  FlatList,
  Dimensions,
} from "react-native";
import { MapView, Marker, PROVIDER_DEFAULT, Region } from "@/src/lib/map";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";

import { api, Property } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { PropertyMarker } from "@/src/components/PropertyMarker";
import { FilterChip } from "@/src/components/FilterChip";
import { PropertyCard } from "@/src/components/PropertyCard";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 32;

type ListingFilter = "all" | "buy" | "rent" | "land" | "commercial" | "shortlet" | "verified";

const FILTERS: { key: ListingFilter; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all", label: "All" },
  { key: "buy", label: "Buy" },
  { key: "rent", label: "Rent" },
  { key: "shortlet", label: "Short Let" },
  { key: "land", label: "Land" },
  { key: "commercial", label: "Commercial" },
  { key: "verified", label: "Verified", icon: "shield-checkmark" },
];

const INITIAL_REGION: Region = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 1.2,
  longitudeDelta: 1.2,
};

export default function HomeMap() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const carouselRef = useRef<FlatList<Property>>(null);

  const [filter, setFilter] = useState<ListingFilter>("all");
  const [query, setQuery] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (filter === "buy") params.listing_type = "buy";
      else if (filter === "rent") params.listing_type = "rent";
      else if (filter === "shortlet") params.listing_type = "shortlet";
      else if (filter === "land") params.property_type = "land";
      else if (filter === "commercial") params.property_type = "commercial";
      else if (filter === "verified") params.verified = true;
      if (query.trim()) params.q = query.trim();
      const list = await api.listProperties(params);
      setProperties(list);
      if (list.length) setActiveId(list[0].id);
    } catch {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .favoriteIds()
      .then((r) => setFavorites(new Set(r.ids)))
      .catch(() => {});
  }, []);

  const activeIndex = useMemo(
    () => Math.max(0, properties.findIndex((p) => p.id === activeId)),
    [properties, activeId]
  );

  const focusProperty = useCallback((p: Property) => {
    mapRef.current?.animateToRegion(
      {
        latitude: p.latitude,
        longitude: p.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      },
      450
    );
  }, []);

  const onMarkerPress = (p: Property) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveId(p.id);
    const i = properties.findIndex((x) => x.id === p.id);
    if (i >= 0) carouselRef.current?.scrollToIndex({ index: i, animated: true });
    focusProperty(p);
  };

  const onFavorite = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFavorites(next);
    try {
      await api.toggleFavorite(id);
    } catch {}
  };

  const carouselBottom = 68 + Math.max(insets.bottom, 12) + 20; // above floating tabbar
  const searchTop = insets.top + spacing.sm;

  return (
    <View style={styles.container} testID="home-map-screen">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        mapType="hybrid"
        initialRegion={INITIAL_REGION}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {properties.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            onPress={() => onMarkerPress(p)}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={Platform.OS === "ios" ? false : true}
          >
            <PropertyMarker
              status={p.status}
              label={formatNaira(p.price)}
              active={p.id === activeId}
            />
          </Marker>
        ))}
      </MapView>

      {/* Floating search + filters */}
      <View style={[styles.topOverlay, { top: searchTop }]} pointerEvents="box-none">
        <View style={[styles.searchBar, shadows.card]}>
          {Platform.OS === "ios" ? (
            <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.96)" }]} />
          )}
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            placeholder="Where to? Location, address, ID"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={load}
            returnKeyType="search"
            testID="home-search-input"
          />
          <Pressable
            onPress={() => router.push("/ai-search")}
            style={styles.aiBadge}
            testID="home-ai-btn"
          >
            <Ionicons name="sparkles" size={14} color="#fff" />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={{ marginTop: spacing.md }}
        >
          {FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              icon={f.icon}
              active={filter === f.key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setFilter(f.key);
              }}
            />
          ))}
        </ScrollView>
      </View>

      {/* Right floating actions */}
      <View style={[styles.rightActions, { top: searchTop + 120 }]}>
        <ActionBtn
          icon="locate"
          onPress={() =>
            mapRef.current?.animateToRegion(INITIAL_REGION, 500)
          }
          testID="recenter-btn"
        />
        <ActionBtn icon="layers-outline" onPress={() => {}} testID="layers-btn" />
      </View>

      {/* Loading indicator */}
      {loading && (
        <View style={[styles.loading, { top: searchTop + 130 }]}>
          <ActivityIndicator size="small" color={colors.red} />
          <Text style={styles.loadingText}>Loading properties…</Text>
        </View>
      )}

      {/* Bottom property carousel */}
      {!loading && properties.length > 0 && (
        <View style={[styles.carousel, { bottom: carouselBottom }]} pointerEvents="box-none">
          <FlatList
            ref={carouselRef}
            data={properties}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 12}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + 12));
              const p = properties[idx];
              if (p) {
                setActiveId(p.id);
                focusProperty(p);
              }
            }}
            renderItem={({ item }) => (
              <View style={{ width: CARD_WIDTH }}>
                <PropertyCard
                  property={item}
                  onPress={() => router.push(`/property/${item.id}`)}
                  onFavorite={() => onFavorite(item.id)}
                  favorited={favorites.has(item.id)}
                  variant="floating"
                />
              </View>
            )}
            getItemLayout={(_, index) => ({
              length: CARD_WIDTH + 12,
              offset: (CARD_WIDTH + 12) * index,
              index,
            })}
            initialScrollIndex={activeIndex}
          />
        </View>
      )}

      {!loading && properties.length === 0 && (
        <View style={[styles.emptyBanner, { bottom: carouselBottom }]}>
          <Text style={styles.emptyText}>No properties match your filters.</Text>
        </View>
      )}
    </View>
  );
}

function ActionBtn({
  icon,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.actionBtn, shadows.card]} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topOverlay: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 54,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: "500",
  },
  aiBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  chipsRow: {
    gap: 8,
    paddingRight: 8,
  },
  rightActions: {
    position: "absolute",
    right: spacing.lg,
    gap: spacing.sm,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  loading: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    ...shadows.card,
  },  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  carousel: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  emptyBanner: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.pill,
    ...shadows.card,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
