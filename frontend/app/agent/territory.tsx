/**
 * Agent — Territory Setup (Phase D-5)
 * Set the state, LGAs and optional radius from a center point so
 * verification tasks in your area surface in your queue.
 */
import React, { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Button, Card, Chip, Input, Screen, ScreenHeader, SkeletonRows, useToast } from "@/src/ui";

const NIGERIAN_STATES = ["Lagos", "Abuja", "Rivers", "Kano", "Oyo", "Kaduna", "Ogun", "Enugu", "Anambra", "Edo", "Delta", "Cross River", "Akwa Ibom", "Imo", "Abia", "Osun", "Ekiti", "Plateau"];

export default function AgentTerritoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [state, setState] = useState("");
  const [lgasText, setLgasText] = useState("");
  const [areasText, setAreasText] = useState("");
  const [centerLat, setCenterLat] = useState<string>("");
  const [centerLng, setCenterLng] = useState<string>("");
  const [radiusKm, setRadiusKm] = useState<string>("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await api.agentGetTerritory();
      if (t?.state) {
        setState(t.state);
        setLgasText((t.lgas ?? []).join(", "));
        setAreasText((t.areas ?? []).join(", "));
        setCenterLat(t.center_lat != null ? String(t.center_lat) : "");
        setCenterLng(t.center_lng != null ? String(t.center_lng) : "");
        setRadiusKm(t.radius_km != null ? String(t.radius_km) : "");
        setActive(t.is_active ?? true);
      }
    } catch (e: any) {
      toast.error("Couldn't load territory", e?.message ?? "Try again");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const captureCenter = async () => {
    setGpsBusy(true);
    try {
      const current = await Location.getForegroundPermissionsAsync();
      let status = current.status;
      if (status !== "granted") {
        if (!current.canAskAgain) {
          toast.show({ kind: "warning", title: "Location is off for AMASS", body: "Enable it in Settings to use your GPS as the base point.", actionLabel: "Open Settings", onAction: () => Linking.openSettings() });
          return;
        }
        status = (await Location.requestForegroundPermissionsAsync()).status;
        if (status !== "granted") {
          toast.info("Location not shared", "You can still type the coordinates manually.");
          return;
        }
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCenterLat(loc.coords.latitude.toFixed(6));
      setCenterLng(loc.coords.longitude.toFixed(6));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("GPS failed", e?.message ?? "Try again");
    } finally {
      setGpsBusy(false);
    }
  };

  const save = async () => {
    if (!state.trim()) {
      setStateError("Pick the state you cover.");
      return;
    }
    setSaving(true);
    try {
      const lgas = lgasText.split(",").map((x) => x.trim()).filter(Boolean);
      const areas = areasText.split(",").map((x) => x.trim()).filter(Boolean);
      await api.agentSetTerritory({
        state: state.trim(),
        lgas,
        areas,
        center_lat: centerLat ? parseFloat(centerLat) : null,
        center_lng: centerLng ? parseFloat(centerLng) : null,
        radius_km: radiusKm ? parseFloat(radiusKm) : null,
        is_active: active,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Territory saved", "You'll start receiving matching tasks.");
      router.back();
    } catch (e: any) {
      toast.error("Save failed", e?.message ?? "Try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen testID="agent-territory">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My territory" subtitle="Where you verify properties" />
      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={4} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 60 + insets.bottom }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Card elevation="xs" style={{ gap: 10 }}>
              <AppText variant="title">State</AppText>
              <View style={styles.chipsWrap}>
                {NIGERIAN_STATES.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    selected={state === s}
                    onPress={() => {
                      setState(s);
                      setStateError(null);
                    }}
                    testID={`state-${s}`}
                  />
                ))}
              </View>
              {stateError ? (
                <AppText variant="caption" tone="error" accessibilityRole="alert">
                  {stateError}
                </AppText>
              ) : null}
            </Card>

            <Card elevation="xs" style={{ gap: 12 }}>
              <Input label="LGAs (comma-separated)" value={lgasText} onChangeText={setLgasText} placeholder="Ikoyi, Victoria Island, Lekki" testID="input-lgas" />
              <Input label="Areas (optional)" value={areasText} onChangeText={setAreasText} placeholder="Parkview, Banana Island, Osborne" testID="input-areas" />
            </Card>

            <Card elevation="xs" style={{ gap: 12 }}>
              <View style={{ gap: 2 }}>
                <AppText variant="title">Radius from your base (optional)</AppText>
                <AppText variant="caption" tone="secondary">
                  Tasks farther than the radius won&apos;t surface, even inside your LGAs.
                </AppText>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Input containerStyle={{ flex: 1 }} label="Latitude" value={centerLat} onChangeText={setCenterLat} keyboardType="numeric" placeholder="6.4400" testID="input-lat" />
                <Input containerStyle={{ flex: 1 }} label="Longitude" value={centerLng} onChangeText={setCenterLng} keyboardType="numeric" placeholder="3.4750" testID="input-lng" />
              </View>
              <Button label="Use my current GPS" variant="secondary" fullWidth iconLeft="locate" loading={gpsBusy} onPress={captureCenter} testID="btn-use-my-gps" />
              <Input label="Radius (km)" value={radiusKm} onChangeText={setRadiusKm} keyboardType="numeric" placeholder="15" testID="input-radius" />
            </Card>

            <Card elevation="xs">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title">Active</AppText>
                  <AppText variant="caption" tone="secondary">
                    Turn off to pause new task assignments without losing setup.
                  </AppText>
                </View>
                <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.success, false: colors.surfaceSunken }} accessibilityLabel="Territory active" testID="switch-active" />
              </View>
            </Card>

            <Button label="Save territory" size="lg" fullWidth iconLeft="save" loading={saving} onPress={save} testID="btn-save-territory" />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
