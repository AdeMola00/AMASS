/**
 * Local map — useful places recommended by neighbours (never property markers).
 * Native: map + list. Web: list (react-native-maps is native-only). Places can be saved to a
 * shared "places" list; estate amenities are visible to that estate's residents only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform, Linking } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import { MapView, Marker, PROVIDER_DEFAULT, type Region } from "@/src/lib/map";
import { api, Estate, Place } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Chip, EmptyState, IconButton, Input, Screen, ScreenHeader, Sheet, SkeletonRows, useToast, type IconName } from "@/src/ui";
import { ToggleRow } from "@/src/components/neighbours/ToggleRow";
import { AddToCollectionSheet } from "@/src/components/neighbours/AddToCollectionSheet";
import { ReportSheet } from "@/src/components/neighbours/ReportSheet";
import { timeAgo } from "@/src/components/neighbours/PostRow";

const LAGOS = { latitude: 6.4494, longitude: 3.4739 };
const CAT_ICON: Record<string, IconName> = {
  supermarket: "cart", pharmacy: "medkit", clinic: "fitness", school: "school", restaurant: "restaurant", gym: "barbell", salon: "cut", laundry: "shirt", mechanic: "car-sport", atm: "cash", park: "leaf", worship: "flower", security: "shield", amenity: "business", other: "location",
};
type Perm = "unknown" | "granted" | "denied" | "blocked";

export default function PlacesScreen() {
  const { focus, estate_id } = useLocalSearchParams<{ focus?: string; estate_id?: string }>();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const mapRef = useRef<any>(null);
  const [perm, setPerm] = useState<Perm>("unknown");
  const [center, setCenter] = useState<{ latitude: number; longitude: number }>(LAGOS);
  const [centerSource, setCenterSource] = useState<"default" | "me" | "estate">("default");
  const [estates, setEstates] = useState<Estate[]>([]);
  const [items, setItems] = useState<Place[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saveFor, setSaveFor] = useState<Place | null>(null);
  const [report, setReport] = useState<Place | null>(null);

  // Estates give a sensible centre even without location permission.
  useEffect(() => {
    api
      .myEstates()
      .then((list) => {
        const ok = list.filter((e) => e.membership?.status === "approved" && e.latitude != null && e.longitude != null);
        setEstates(ok);
        const pick = ok.find((e) => e.id === estate_id) ?? ok[0];
        if (pick && centerSource === "default") {
          setCenter({ latitude: pick.latitude!, longitude: pick.longitude! });
          setCenterSource("estate");
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Platform.OS === "web") {
      setPerm("denied");
      return;
    }
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (p.status === "granted") locateMe();
        else setPerm(p.canAskAgain ? "denied" : "blocked");
      })
      .catch(() => setPerm("denied"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locateMe = async () => {
    try {
      let p = await Location.getForegroundPermissionsAsync();
      if (p.status !== "granted") {
        if (!p.canAskAgain) {
          setPerm("blocked");
          return;
        }
        p = await Location.requestForegroundPermissionsAsync();
      }
      if (p.status !== "granted") {
        setPerm(p.canAskAgain ? "denied" : "blocked");
        return;
      }
      setPerm("granted");
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setCenter(c);
      setCenterSource("me");
      mapRef.current?.animateToRegion?.({ ...c, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 600);
    } catch {
      setPerm("denied");
    }
  };

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.placesNearby({ lat: center.latitude, lng: center.longitude, radius_km: 5, category: cat ?? undefined });
      setItems(r.items);
      setCats(r.categories);
      if (focus) {
        const f = r.items.find((p) => p.id === focus);
        if (f) setSelected(f);
      }
    } catch {
      setError(true);
    }
  }, [center, cat, focus]);
  useEffect(() => {
    load();
  }, [load]);

  const openPlace = async (p: Place) => {
    setSelected(p);
    try {
      setSelected(await api.place(p.id));
    } catch {}
  };
  const recommend = async (p: Place, text?: string) => {
    try {
      const r = await api.placeRecommend(p.id, text);
      toast.success(r.recommended ? "Recommended to neighbours" : "Recommendation removed");
      const fresh = await api.place(p.id);
      setSelected(fresh);
      setItems((prev) => prev?.map((x) => (x.id === p.id ? { ...x, recommendation_count: fresh.recommendation_count, recommended_by_me: fresh.recommended_by_me } : x)) ?? null);
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    }
  };

  const region: Region = useMemo(() => ({ ...center, latitudeDelta: 0.03, longitudeDelta: 0.03 }), [center]);
  const list = items ?? [];

  return (
    <Screen testID="places-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Local map" subtitle="Places neighbours actually recommend" right={<IconButton icon="add" label="Add a place" variant="primary" onPress={() => setAddOpen(true)} testID="places-add" />} />
      {Platform.OS !== "web" ? (
        <View style={styles.mapWrap}>
          <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={PROVIDER_DEFAULT} initialRegion={region} showsUserLocation={perm === "granted"} showsMyLocationButton={false} toolbarEnabled={false} onRegionChangeComplete={(r: Region) => setCenter({ latitude: r.latitude, longitude: r.longitude })} testID="places-map">
            {list.map((p) => (
              <Marker key={p.id} coordinate={{ latitude: p.latitude, longitude: p.longitude }} onPress={() => openPlace(p)} tracksViewChanges={false} accessibilityLabel={p.name}>
                <View style={[styles.pin, { backgroundColor: selected?.id === p.id ? colors.text : p.is_amenity ? colors.success : colors.info, borderColor: colors.bg }]}>
                  <Ionicons name={CAT_ICON[p.category] ?? "location"} size={14} color="#fff" />
                </View>
              </Marker>
            ))}
          </MapView>
          <View style={styles.mapControls} pointerEvents="box-none">
            <IconButton icon="locate" label="My location" onPress={locateMe} testID="places-locate" />
          </View>
        </View>
      ) : (
        <View style={[styles.webNote, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="map-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
            The interactive map shows on your phone. Here’s the list of recommended places near {centerSource === "estate" ? "your estate" : "Lagos"}.
          </AppText>
        </View>
      )}

      <View style={{ paddingHorizontal: space[4], paddingVertical: 8, gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" selected={!cat} onPress={() => setCat(null)} testID="places-cat-all" />
          {cats.map((c) => (
            <Chip key={c} label={c.charAt(0).toUpperCase() + c.slice(1)} icon={CAT_ICON[c]} selected={cat === c} onPress={() => setCat(cat === c ? null : c)} testID={`places-cat-${c}`} />
          ))}
        </ScrollView>
        {perm !== "granted" && Platform.OS !== "web" ? (
          <View style={[styles.permRow, { backgroundColor: colors.infoSoft }]} testID="places-perm">
            <Ionicons name="navigate-circle-outline" size={18} color={colors.info} />
            <AppText variant="caption" style={{ flex: 1 }}>
              {perm === "blocked" ? "Location is off for AMASS. Turn it on in Settings to see places around you." : "Allow location to see recommendations around you. We never store your precise position."}
            </AppText>
            <Button label={perm === "blocked" ? "Open Settings" : "Use my location"} size="xs" variant="secondary" onPress={perm === "blocked" ? () => Linking.openSettings() : locateMe} testID="places-perm-btn" />
          </View>
        ) : null}
        {estates.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {estates.map((e) => (
              <Pressable key={e.id} onPress={() => { setCenter({ latitude: e.latitude!, longitude: e.longitude! }); setCenterSource("estate"); mapRef.current?.animateToRegion?.({ latitude: e.latitude!, longitude: e.longitude!, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 600); }} style={[styles.estateChip, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel={`Centre on ${e.name}`} testID={`places-estate-${e.id}`}>
                <Ionicons name="business-outline" size={13} color={colors.textSecondary} />
                <AppText variant="micro" weight="bold">
                  {e.name}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: 8 }}>
        {items === null && !error ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <EmptyState compact variant="error" title="Couldn't load places" actionLabel="Retry" onAction={load} />
        ) : list.length === 0 ? (
          <EmptyState compact icon="location-outline" title="Nothing recommended here yet" body="Add the pharmacy, mechanic or school you'd trust a neighbour with." actionLabel="Add a place" onAction={() => setAddOpen(true)} testID="places-empty" />
        ) : (
          list.map((p) => (
            <Pressable key={p.id} onPress={() => openPlace(p)} style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={p.name} testID={`place-row-${p.id}`}>
              <View style={[styles.rowIcon, { backgroundColor: p.is_amenity ? colors.successSoft : colors.infoSoft }]}>
                <Ionicons name={CAT_ICON[p.category] ?? "location"} size={18} color={p.is_amenity ? colors.success : colors.info} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {p.name}
                </AppText>
                <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                  {p.category}
                  {p.distance_km != null ? ` · ${p.distance_km} km` : ""}
                  {p.address_label ? ` · ${p.address_label}` : ""}
                </AppText>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Badge label={`${p.recommendation_count} recommend${p.recommendation_count === 1 ? "s" : ""}`} tone={p.recommended_by_me ? "success" : "neutral"} size="xs" icon="thumbs-up" />
                  {p.is_amenity ? <Badge label="Estate amenity" tone="success" size="xs" /> : null}
                  {p.label ? <Badge label={p.label} tone="premium" size="xs" /> : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))
        )}
        <AppText variant="micro" tone="tertiary" align="center" style={{ marginTop: 6 }}>
          Promoted places are labelled. Recommendations come from residents — not advertisers.
        </AppText>
      </ScrollView>

      <PlaceSheet place={selected} onClose={() => setSelected(null)} onRecommend={recommend} onSave={() => { setSaveFor(selected); setSelected(null); }} onReport={() => { setReport(selected); setSelected(null); }} isDark={isDark} />
      <AddPlaceSheet visible={addOpen} onClose={() => setAddOpen(false)} center={center} cats={cats} estates={estates} onCreated={(p) => { setAddOpen(false); load(); if (p) setSelected(p); }} />
      {saveFor ? <AddToCollectionSheet visible onClose={() => setSaveFor(null)} targetId={saveFor.id} kind="place" /> : null}
      {report ? <ReportSheet visible onClose={() => setReport(null)} targetType="place" targetId={report.id} estateId={report.estate_id ?? undefined} /> : null}
    </Screen>
  );
}

function PlaceSheet({ place: p, onClose, onRecommend, onSave, onReport, isDark }: { place: Place | null; onClose: () => void; onRecommend: (p: Place, text?: string) => void; onSave: () => void; onReport: () => void; isDark: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  useEffect(() => {
    setNote("");
    setNoting(false);
  }, [p?.id]);
  return (
    <Sheet visible={!!p} onClose={onClose} title={p?.name ?? ""} testID="place-sheet">
      {p ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <Badge label={p.category} tone="info" size="xs" icon={CAT_ICON[p.category] ?? "location"} />
            {p.is_amenity ? <Badge label="Estate amenity" tone="success" size="xs" /> : null}
            {p.label ? <Badge label={p.label} tone="premium" size="xs" /> : null}
            {p.distance_km != null ? <Badge label={`${p.distance_km} km away`} tone="neutral" size="xs" /> : null}
          </View>
          {p.address_label ? (
            <AppText variant="bodySm" tone="secondary">
              {p.address_label}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flexDirection: "row" }}>
              {(p.recommenders ?? []).slice(0, 5).map((u, i) => (
                <View key={u.id} style={{ marginLeft: i ? -8 : 0 }}>
                  <Avatar name={u.full_name} uri={u.avatar_url} size={26} tone="soft" />
                </View>
              ))}
            </View>
            <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
              {p.recommendation_count} neighbour{p.recommendation_count === 1 ? "" : "s"} recommend this
              {p.verified_resident_recommendations ? ` · ${p.verified_resident_recommendations} verified resident${p.verified_resident_recommendations === 1 ? "" : "s"}` : ""}
            </AppText>
          </View>
          {p.notes?.length ? (
            <View style={{ gap: 6 }}>
              {p.notes.slice(-4).map((n, i) => (
                <View key={`${n.at}-${i}`} style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
                  <AppText variant="micro" tone="tertiary">
                    {n.user?.full_name ?? "Neighbour"} · {timeAgo(n.at)}
                  </AppText>
                  <AppText variant="bodySm">{n.text}</AppText>
                </View>
              ))}
            </View>
          ) : null}
          {noting ? (
            <View style={{ gap: 8 }}>
              <Input value={note} onChangeText={setNote} placeholder="Why do you recommend it?" maxLength={300} autoFocus testID="place-note-input" />
              <Button label="Recommend with note" fullWidth disabled={note.trim().length < 2} onPress={() => { onRecommend(p, note.trim()); setNoting(false); }} testID="place-note-submit" />
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label={p.recommended_by_me ? "Recommended ✓" : "Recommend"} variant={p.recommended_by_me ? "primary" : "secondary"} iconLeft="thumbs-up-outline" style={{ flex: 1 }} onPress={() => (p.recommended_by_me ? onRecommend(p) : setNoting(true))} testID="place-recommend" />
              <Button label="Save to list" variant="secondary" iconLeft="albums-outline" style={{ flex: 1 }} onPress={onSave} testID="place-save" />
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Directions" variant="ghost" size="sm" iconLeft="navigate-outline" onPress={() => Linking.openURL(Platform.select({ ios: `maps:0,0?q=${encodeURIComponent(p.name)}@${p.latitude},${p.longitude}`, default: `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}` })!)} testID="place-directions" />
            <Button label="Ask neighbours about it" variant="ghost" size="sm" iconLeft="help-circle-outline" onPress={() => { onClose(); router.push((p.estate_id ? `/neighbours/estates/${p.estate_id}?compose=question` : "/neighbours/estates") as any); }} />
            <View style={{ flex: 1 }} />
            <IconButton icon="flag-outline" label="Report place" size={34} iconSize={16} variant="ghost" onPress={onReport} testID="place-report" />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

function AddPlaceSheet({ visible, onClose, center, cats, estates, onCreated }: { visible: boolean; onClose: () => void; center: { latitude: number; longitude: number }; cats: string[]; estates: Estate[]; onCreated: (p?: Place) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [cat, setCat] = useState("supermarket");
  const [addr, setAddr] = useState("");
  const [note, setNote] = useState("");
  const [estateId, setEstateId] = useState<string | null>(null);
  const [amenity, setAmenity] = useState(false);
  const [busy, setBusy] = useState(false);
  const manager = estates.find((e) => e.id === estateId)?.membership?.role === "manager";
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.placeCreate({ name: name.trim(), category: cat, latitude: center.latitude, longitude: center.longitude, address_label: addr.trim() || undefined, note: note.trim() || undefined, estate_id: estateId ?? undefined, is_amenity: amenity && manager });
      toast.success(r.duplicate ? "Already on the map" : "Place added", r.duplicate ? "We've opened the existing entry." : "Thanks — neighbours can now recommend it.");
      setName("");
      setAddr("");
      setNote("");
      onCreated(r.place);
    } catch (e: any) {
      toast.error("Couldn't add place", e?.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a place" testID="add-place-sheet">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
        <AppText variant="caption" tone="secondary">
          Placed at the centre of the map{Platform.OS === "web" ? " (your estate or Lagos on web)" : " — move the map first to pin it accurately"}.
        </AppText>
        <Input value={name} onChangeText={setName} placeholder="Name · e.g. Medplus Pharmacy" maxLength={80} testID="place-name" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(cats.length ? cats : Object.keys(CAT_ICON)).filter((c) => c !== "amenity").map((c) => (
            <Chip key={c} label={c} icon={CAT_ICON[c]} selected={cat === c} onPress={() => setCat(c)} testID={`place-cat-${c}`} />
          ))}
        </ScrollView>
        <Input value={addr} onChangeText={setAddr} placeholder="Address or landmark (optional)" maxLength={160} iconLeft="location-outline" testID="place-address" />
        <Input value={note} onChangeText={setNote} placeholder="Why you recommend it (optional)" maxLength={300} testID="place-note" />
        {estates.length ? (
          <View style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="Public place" selected={!estateId} onPress={() => { setEstateId(null); setAmenity(false); }} />
              {estates.map((e) => (
                <Chip key={e.id} label={`Near ${e.name}`} selected={estateId === e.id} onPress={() => setEstateId(e.id)} />
              ))}
            </ScrollView>
            {manager ? <ToggleRow value={amenity} onChange={setAmenity} label="Estate amenity (residents only)" testID="place-amenity" /> : null}
          </View>
        ) : null}
        <Button label="Add to map" size="lg" fullWidth disabled={name.trim().length < 2} loading={busy} onPress={submit} testID="place-submit" />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mapWrap: { height: 240, marginHorizontal: space[4], borderRadius: radii.lg, overflow: "hidden" },
  mapControls: { position: "absolute", right: 10, bottom: 10 },
  pin: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  webNote: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: space[4], padding: 12, borderRadius: radii.md },
  permRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.md },
  estateChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 30, borderRadius: radii.pill, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  note: { padding: 10, borderRadius: radii.md, gap: 2 },
});
