/**
 * Estates directory — find and join a verified estate; propose a new one for AMASS review.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Platform } from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import { api, Estate } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";
import { ToggleRow } from "@/src/components/neighbours/ToggleRow";

export default function EstatesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Estate[] | null>(null);
  const [mine, setMine] = useState<Estate[]>([]);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    Location.getForegroundPermissionsAsync()
      .then(async (p) => {
        if (p.status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [dir, my] = await Promise.all([api.estates({ q: q.trim() || undefined, lat: coords?.lat, lng: coords?.lng }), api.myEstates()]);
      setItems(dir.items);
      setMine(my);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [q, coords]);

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(load, q ? 250 : 0);
      return () => clearTimeout(t);
    }, [load, q])
  );

  const myIds = new Set(mine.map((e) => e.id));
  const others = (items ?? []).filter((e) => !myIds.has(e.id));

  return (
    <Screen testID="estates-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Estates" subtitle="Verified communities · residents only" />
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <Input value={q} onChangeText={setQ} placeholder="Search estate, area or city" iconLeft="search-outline" autoCorrect={false} returnKeyType="search" testID="estates-search" />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: space[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} keyboardShouldPersistTaps="handled">
        {items === null && !error ? (
          <SkeletonRows rows={5} />
        ) : error ? (
          <EmptyState variant="error" title="Couldn't load estates" actionLabel="Retry" onAction={load} />
        ) : (
          <>
            {mine.length ? (
              <View style={{ gap: 8 }}>
                <AppText variant="label" tone="tertiary" uppercase>
                  My estates
                </AppText>
                {mine.map((e) => (
                  <EstateRow key={e.id} estate={e} onPress={() => router.push(`/neighbours/estates/${e.id}` as any)} />
                ))}
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <AppText variant="label" tone="tertiary" uppercase>
                {coords ? "Near you" : q ? "Results" : "All estates"}
              </AppText>
              {others.length === 0 ? (
                <EmptyState compact icon="business-outline" title={q ? `No estate matches “${q}”` : "No estates listed yet"} body="Estates are verified by AMASS before residents can join. Propose yours below." testID="estates-empty" />
              ) : (
                others.map((e) => <EstateRow key={e.id} estate={e} onPress={() => router.push(`/neighbours/estates/${e.id}` as any)} />)
              )}
            </View>
            <Card elevation="none" style={{ backgroundColor: colors.surfaceAlt, borderColor: "transparent" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="add-circle-outline" size={26} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">Can’t find your estate?</AppText>
                  <AppText variant="caption" tone="secondary">
                    Propose it. AMASS reviews new estates within 2 working days and confirms a manager.
                  </AppText>
                </View>
                <Button label="Propose" size="sm" variant="secondary" onPress={() => setRequestOpen(true)} testID="estates-propose" />
              </View>
            </Card>
            <AppText variant="micro" tone="tertiary" align="center">
              Estate pages show an approximate location only — never a resident’s home.
            </AppText>
          </>
        )}
      </ScrollView>
      <RequestEstateSheet visible={requestOpen} onClose={() => setRequestOpen(false)} onDone={() => { setRequestOpen(false); load(); }} toast={toast} coords={coords} />
    </Screen>
  );
}

function EstateRow({ estate: e, onPress }: { estate: Estate; onPress: () => void }) {
  const { colors } = useTheme();
  const m = e.membership;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={e.name} testID={`estate-row-${e.id}`}>
      {e.cover_image ? <Image source={{ uri: e.cover_image }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }]}><Ionicons name="business" size={22} color={colors.brand} /></View>}
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {e.name}
        </AppText>
        <AppText variant="micro" tone="tertiary" numberOfLines={1}>
          {[e.area, e.city].filter(Boolean).join(", ")}
          {e.distance_km != null ? ` · ${e.distance_km} km` : ""}
          {e.member_count != null ? ` · ${e.member_count} residents` : ""}
        </AppText>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {e.status === "pending" ? <Badge label="Awaiting AMASS review" tone="warning" size="xs" icon="time" /> : m?.status === "approved" ? <Badge label={m.role === "manager" ? "Manager" : "Verified resident"} tone={m.role === "manager" ? "brand" : "success"} size="xs" icon="shield-checkmark" /> : m?.status === "pending" ? <Badge label="Request pending" tone="warning" size="xs" icon="time" /> : m?.status === "rejected" ? <Badge label="Not verified" tone="neutral" size="xs" /> : <Badge label="Verified estate" tone="info" size="xs" icon="checkmark-circle" />}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function RequestEstateSheet({ visible, onClose, onDone, toast, coords }: { visible: boolean; onClose: () => void; onDone: () => void; toast: ReturnType<typeof useToast>; coords: { lat: number; lng: number } | null }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [desc, setDesc] = useState("");
  const [manager, setManager] = useState(false);
  const [useLoc, setUseLoc] = useState(!!coords);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.estateRequest({ name: name.trim(), city: city.trim(), area: area.trim() || undefined, description: desc.trim() || undefined, i_am_manager: manager, latitude: useLoc && coords ? coords.lat : undefined, longitude: useLoc && coords ? coords.lng : undefined });
      toast.success("Estate proposed", r.message);
      setName("");
      setCity("");
      setArea("");
      setDesc("");
      onDone();
    } catch (e: any) {
      toast.error("Couldn't propose estate", e?.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Propose an estate" testID="request-estate-sheet">
      <View style={{ gap: 10 }}>
        <Input label="Estate name" value={name} onChangeText={setName} placeholder="e.g. Pinnock Beach Estate" maxLength={80} testID="req-estate-name" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input label="City" value={city} onChangeText={setCity} placeholder="Lagos" maxLength={60} testID="req-estate-city" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Area" value={area} onChangeText={setArea} placeholder="Lekki" maxLength={80} testID="req-estate-area" />
          </View>
        </View>
        <Input label="About (optional)" value={desc} onChangeText={setDesc} placeholder="Gated estate with ~200 homes…" multiline maxLength={400} style={{ minHeight: 70, textAlignVertical: "top" }} />
        <ToggleRow value={manager} onChange={setManager} label="I'm part of estate management" testID="req-estate-manager" />
        {coords ? <ToggleRow value={useLoc} onChange={setUseLoc} label="Use my current location as the estate's approximate point" /> : null}
        <AppText variant="micro" tone="tertiary">
          Estates go live once AMASS verifies them. Managers get a join code to share with residents.
        </AppText>
        <Button label="Send for review" size="lg" fullWidth disabled={name.trim().length < 3 || city.trim().length < 2} loading={busy} onPress={submit} testID="req-estate-submit" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  thumb: { width: 56, height: 56, borderRadius: radii.md },
});
