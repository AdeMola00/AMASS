/**
 * Agent — Territory Setup (Phase D-5)
 * Set the state, LGAs and optional radius from a center point so
 * verification tasks in your area surface in your queue.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

const NIGERIAN_STATES = [
  "Lagos", "Abuja", "Rivers", "Kano", "Oyo", "Kaduna", "Ogun", "Enugu", "Anambra", "Edo",
  "Delta", "Cross River", "Akwa Ibom", "Imo", "Abia", "Osun", "Ekiti", "Plateau",
];

export default function AgentTerritoryScreen() {
  const router = useRouter();
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
      Alert.alert("Failed", e?.message ?? "Try again");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const captureCenter = async () => {
    setGpsBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCenterLat(loc.coords.latitude.toFixed(6));
      setCenterLng(loc.coords.longitude.toFixed(6));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert("GPS failed", e?.message ?? "Try again");
    } finally {
      setGpsBusy(false);
    }
  };

  const save = async () => {
    if (!state.trim()) {
      Alert.alert("State required", "Pick the state you cover.");
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
      Alert.alert("Territory saved", "You'll start receiving matching tasks.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Try again");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Territory" onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="agent-territory">
      <Header title="My Territory" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: 14, paddingBottom: 60 }}>
          <View style={[styles.card, shadows.soft]}>
            <Text style={styles.sectionTitle}>State</Text>
            <View style={styles.chipsWrap}>
              {NIGERIAN_STATES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.stateChip, state === s && styles.stateChipActive]}
                  onPress={() => {
                    setState(s);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  testID={`state-${s}`}
                >
                  <Text style={[styles.stateChipText, state === s && { color: "#fff" }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.card, shadows.soft]}>
            <Text style={styles.sectionTitle}>LGAs (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={lgasText}
              onChangeText={setLgasText}
              placeholder="Ikoyi, Victoria Island, Lekki"
              placeholderTextColor={colors.textMuted}
              testID="input-lgas"
            />
            <Text style={styles.sectionTitle}>Areas (optional)</Text>
            <TextInput
              style={styles.input}
              value={areasText}
              onChangeText={setAreasText}
              placeholder="Parkview, Banana Island, Osborne"
              placeholderTextColor={colors.textMuted}
              testID="input-areas"
            />
          </View>

          <View style={[styles.card, shadows.soft]}>
            <Text style={styles.sectionTitle}>Radius from your base (optional)</Text>
            <Text style={styles.hint}>Tasks farther than the radius won&apos;t surface, even inside your LGAs.</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLbl}>Latitude</Text>
                <TextInput
                  style={styles.input}
                  value={centerLat}
                  onChangeText={setCenterLat}
                  keyboardType="numeric"
                  placeholder="6.4400"
                  placeholderTextColor={colors.textMuted}
                  testID="input-lat"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLbl}>Longitude</Text>
                <TextInput
                  style={styles.input}
                  value={centerLng}
                  onChangeText={setCenterLng}
                  keyboardType="numeric"
                  placeholder="3.4750"
                  placeholderTextColor={colors.textMuted}
                  testID="input-lng"
                />
              </View>
            </View>
            <Pressable
              style={[styles.actionBtn, styles.secondary]}
              onPress={captureCenter}
              disabled={gpsBusy}
              testID="btn-use-my-gps"
            >
              {gpsBusy ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Ionicons name="locate" size={14} color={colors.text} />
                  <Text style={[styles.actionText, { color: colors.text }]}>Use my current GPS</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.fieldLbl}>Radius (km)</Text>
            <TextInput
              style={styles.input}
              value={radiusKm}
              onChangeText={setRadiusKm}
              keyboardType="numeric"
              placeholder="15"
              placeholderTextColor={colors.textMuted}
              testID="input-radius"
            />
          </View>

          <View style={[styles.card, shadows.soft, { flexDirection: "row", alignItems: "center" }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Active</Text>
              <Text style={styles.hint}>Turn off to pause new task assignments without losing setup.</Text>
            </View>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.emerald, false: colors.divider }} />
          </View>

          <Pressable
            style={[styles.actionBtn, styles.primary, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
            testID="btn-save-territory"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save" size={16} color="#fff" />
                <Text style={styles.actionText}>Save territory</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },
  card: { padding: 14, borderRadius: radius.md, backgroundColor: "#fff", gap: 8 },
  sectionTitle: { ...typography.h2, fontSize: 13, letterSpacing: 0.3 },
  hint: { fontSize: 11, color: colors.textTertiary, fontStyle: "italic" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  stateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  stateChipActive: { backgroundColor: colors.ink },
  stateChipText: { fontSize: 11, fontWeight: "800", color: colors.text, letterSpacing: 0.3 },
  fieldLbl: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4, marginTop: 6 },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.border },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
});
