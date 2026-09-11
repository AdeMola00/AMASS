/**
 * Agent — Verify Existing Lead Wizard (Phase D-5)
 * On-site verification flow: GPS capture → photo → verdict → notes → submit.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type Verdict =
  | "PROPERTY_EXISTS"
  | "DIFFERENT_ADDRESS"
  | "IS_DUPLICATE"
  | "NOT_A_PROPERTY"
  | "INACCESSIBLE";

type Step = "gps" | "photo" | "verdict" | "review";

function gpsTier(accuracy: number | null): { label: string; color: string; hint: string } {
  if (accuracy == null) return { label: "unknown", color: colors.textMuted, hint: "Waiting for GPS…" };
  if (accuracy <= 10) return { label: "excellent", color: colors.emerald, hint: "Locked to ±10m." };
  if (accuracy <= 25) return { label: "warning", color: colors.gold, hint: "Move to open sky for a sharper fix." };
  if (accuracy <= 50) return { label: "poor", color: colors.red, hint: "Signal is weak — try stepping outside." };
  return { label: "invalid", color: colors.red, hint: "GPS accuracy too poor to submit." };
}

export default function VerifyWizardScreen() {
  const router = useRouter();
  useAuth(); // ensure auth context is loaded
  const { task_id } = useLocalSearchParams<{ task_id: string }>();

  const [taskData, setTaskData] = useState<Awaited<ReturnType<typeof api.agentVerificationTask>> | null>(null);
  const [step, setStep] = useState<Step>("gps");

  // GPS state
  const [locBusy, setLocBusy] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);

  // Photo state
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  // Verdict + notes
  const [verdict, setVerdict] = useState<Verdict>("PROPERTY_EXISTS");
  const [notes, setNotes] = useState("");
  const [dupOfAmassId, setDupOfAmassId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!task_id) return;
    try {
      const r = await api.agentVerificationTask(String(task_id));
      setTaskData(r);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
    }
  }, [task_id]);

  useEffect(() => {
    load();
  }, [load]);

  const captureGPS = async () => {
    setLocBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        if (!perm.canAskAgain) {
          Alert.alert("Location required", "Grant precise location in Settings.", [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]);
        }
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      setCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert("GPS failed", e?.message ?? "Try again outdoors.");
    } finally {
      setLocBusy(false);
    }
  };

  const pickPhoto = async (fromCamera: boolean) => {
    setPickBusy(true);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        if (!perm.canAskAgain) {
          Alert.alert(
            fromCamera ? "Camera required" : "Photos required",
            "Grant access in Settings to attach a photo.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ]
          );
        }
        return;
      }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"] as any,
            quality: 0.5,
            base64: true,
          });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        setPhotoDataUrl(a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri);
      }
    } finally {
      setPickBusy(false);
    }
  };

  const submit = async () => {
    if (!coords || !task_id) return;
    if (verdict === "IS_DUPLICATE" && !dupOfAmassId.trim()) {
      Alert.alert("AMASS ID required", "Enter the AMASS ID this property duplicates.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.agentSubmitVerification(String(task_id), {
        verdict,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_meters: coords.accuracy ?? undefined,
        photo_data_url: photoDataUrl ?? undefined,
        notes: notes.trim() || undefined,
        duplicate_of_amass_id:
          verdict === "IS_DUPLICATE" ? dupOfAmassId.trim() : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Submitted",
        res.task_status === "COMPLETED"
          ? "Verification recorded. Property status updated."
          : `Task marked ${res.task_status}.`,
        [{ text: "Done", onPress: () => router.replace("/agent/tasks" as any) }]
      );
    } catch (e: any) {
      Alert.alert("Submit failed", e?.message ?? "Try again");
    } finally {
      setSubmitting(false);
    }
  };

  const tier = gpsTier(coords?.accuracy ?? null);
  const canGoNext =
    (step === "gps" && !!coords && tier.label !== "invalid") ||
    (step === "photo") ||
    (step === "verdict");

  const stepIndex = ["gps", "photo", "verdict", "review"].indexOf(step);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="verify-wizard">
      <Header title="On-site Verification" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: 14, paddingBottom: 40 }}>
          {/* Progress dots */}
          <View style={styles.dotsRow}>
            {["GPS", "PHOTO", "VERDICT", "REVIEW"].map((label, i) => (
              <View key={label} style={styles.dotWrap}>
                <View
                  style={[
                    styles.dot,
                    i <= stepIndex ? { backgroundColor: colors.red } : { backgroundColor: colors.divider },
                  ]}
                />
                <Text style={[styles.dotLabel, i === stepIndex && { color: colors.text }]}>{label}</Text>
              </View>
            ))}
          </View>

          {taskData?.task && (
            <View style={[styles.propCard, shadows.soft]}>
              <Text style={styles.propAmass}>{taskData.task.amass_property_id}</Text>
              <Text style={styles.propAddr} numberOfLines={2}>
                {taskData.task.raw_address ??
                  [taskData.task.area, taskData.task.lga, taskData.task.state]
                    .filter(Boolean)
                    .join(", ")}
              </Text>
            </View>
          )}

          {/* STEP 1: GPS */}
          {step === "gps" && (
            <View style={[styles.card, shadows.soft]}>
              <Text style={styles.stepTitle}>1 · Capture your GPS</Text>
              <Text style={styles.stepSub}>
                Stand at the property&apos;s front entrance. Best-for-navigation accuracy is required.
              </Text>
              <Pressable
                style={[styles.actionBtn, styles.primary, locBusy && { opacity: 0.6 }]}
                onPress={captureGPS}
                disabled={locBusy}
                testID="btn-capture-gps"
              >
                {locBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="locate" size={16} color="#fff" />
                    <Text style={styles.actionText}>
                      {coords ? "Refresh GPS" : "Capture GPS now"}
                    </Text>
                  </>
                )}
              </Pressable>
              {coords && (
                <>
                  <View style={styles.gpsRow}>
                    <View style={[styles.gpsTierPill, { backgroundColor: tier.color }]}>
                      <Ionicons name="navigate" size={11} color="#fff" />
                      <Text style={styles.gpsTierText}>{tier.label.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.gpsCoords}>
                      {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                    </Text>
                    <Text style={styles.gpsAcc}>±{Math.round(coords.accuracy ?? 0)}m</Text>
                  </View>
                  <Text style={styles.hint}>{tier.hint}</Text>
                </>
              )}
            </View>
          )}

          {/* STEP 2: Photo */}
          {step === "photo" && (
            <View style={[styles.card, shadows.soft]}>
              <Text style={styles.stepTitle}>2 · Attach a proof photo (optional but recommended)</Text>
              <Text style={styles.stepSub}>
                A shot of the entrance or nearest identifying feature strengthens the verification.
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  style={[styles.actionBtn, styles.secondary, { flex: 1 }, Platform.OS === "web" && { opacity: 0.5 }]}
                  onPress={() => pickPhoto(true)}
                  disabled={pickBusy || Platform.OS === "web"}
                  testID="btn-camera"
                >
                  {pickBusy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <>
                      <Ionicons name="camera" size={16} color={colors.text} />
                      <Text style={[styles.actionText, { color: colors.text }]}>Camera</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.secondary, { flex: 1 }]}
                  onPress={() => pickPhoto(false)}
                  disabled={pickBusy}
                  testID="btn-gallery"
                >
                  <Ionicons name="images" size={16} color={colors.text} />
                  <Text style={[styles.actionText, { color: colors.text }]}>Gallery</Text>
                </Pressable>
              </View>
              {photoDataUrl && (
                <View style={styles.photoWrap}>
                  <RNImage source={{ uri: photoDataUrl }} style={styles.photoImg} />
                  <Pressable style={styles.photoRemove} onPress={() => setPhotoDataUrl(null)}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* STEP 3: Verdict */}
          {step === "verdict" && (
            <View style={[styles.card, shadows.soft]}>
              <Text style={styles.stepTitle}>3 · What did you find?</Text>
              {(
                [
                  { key: "PROPERTY_EXISTS", label: "Property exists as described", icon: "checkmark-circle", color: colors.emerald },
                  { key: "DIFFERENT_ADDRESS", label: "Different address at pin", icon: "swap-horizontal", color: colors.gold },
                  { key: "IS_DUPLICATE", label: "Duplicate of another AMASS property", icon: "git-merge", color: colors.red },
                  { key: "NOT_A_PROPERTY", label: "Not a residential/commercial property", icon: "close-circle", color: colors.red },
                  { key: "INACCESSIBLE", label: "Inaccessible right now (retry later)", icon: "hourglass", color: colors.textMuted },
                ] as { key: Verdict; label: string; icon: any; color: string }[]
              ).map((v) => (
                <Pressable
                  key={v.key}
                  style={[styles.verdictRow, verdict === v.key && styles.verdictRowActive]}
                  onPress={() => {
                    setVerdict(v.key);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  testID={`verdict-${v.key}`}
                >
                  <View style={[styles.verdictIcon, { backgroundColor: v.color }]}>
                    <Ionicons name={v.icon} size={14} color="#fff" />
                  </View>
                  <Text style={styles.verdictLabel}>{v.label}</Text>
                  {verdict === v.key && <Ionicons name="checkmark" size={16} color={colors.red} />}
                </Pressable>
              ))}
              {verdict === "IS_DUPLICATE" && (
                <>
                  <Text style={styles.fieldLbl}>Duplicate of AMASS ID</Text>
                  <TextInput
                    style={styles.input}
                    value={dupOfAmassId}
                    onChangeText={setDupOfAmassId}
                    placeholder="AMASS-LAG-00000123"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    testID="input-dup-of"
                  />
                </>
              )}
              <Text style={styles.fieldLbl}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Gate is set back 20m from the road pin"
                placeholderTextColor={colors.textMuted}
                multiline
                testID="input-notes"
              />
            </View>
          )}

          {/* STEP 4: Review */}
          {step === "review" && (
            <View style={[styles.card, shadows.soft]}>
              <Text style={styles.stepTitle}>4 · Review & submit</Text>
              <ReviewRow label="Verdict" value={verdict.replace(/_/g, " ")} />
              {coords && (
                <ReviewRow
                  label="GPS"
                  value={`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} · ±${Math.round(coords.accuracy ?? 0)}m (${tier.label})`}
                />
              )}
              <ReviewRow label="Photo" value={photoDataUrl ? "Attached" : "None"} />
              {notes.trim() && <ReviewRow label="Notes" value={notes} />}
              {verdict === "IS_DUPLICATE" && (
                <ReviewRow label="Duplicate of" value={dupOfAmassId || "—"} />
              )}
              <Pressable
                style={[styles.actionBtn, styles.primary, { marginTop: 8 }, submitting && { opacity: 0.6 }]}
                onPress={submit}
                disabled={submitting || !coords}
                testID="btn-submit"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={16} color="#fff" />
                    <Text style={styles.actionText}>Submit verification</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* Nav row */}
          <View style={styles.navRow}>
            {step !== "gps" && (
              <Pressable
                style={[styles.actionBtn, styles.secondary, { flex: 1 }]}
                onPress={() => setStep(["gps", "photo", "verdict"][stepIndex - 1] as Step)}
              >
                <Ionicons name="chevron-back" size={16} color={colors.text} />
                <Text style={[styles.actionText, { color: colors.text }]}>Back</Text>
              </Pressable>
            )}
            {step !== "review" && (
              <Pressable
                style={[styles.actionBtn, styles.primary, { flex: 1 }, !canGoNext && { opacity: 0.5 }]}
                disabled={!canGoNext}
                onPress={() => setStep(["photo", "verdict", "review"][stepIndex] as Step)}
                testID="btn-next"
              >
                <Text style={styles.actionText}>Next</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLbl}>{label}</Text>
      <Text style={styles.reviewVal} numberOfLines={3}>{value}</Text>
    </View>
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
  dotsRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 6 },
  dotWrap: { alignItems: "center", gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLabel: { fontSize: 9, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.5 },
  propCard: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 4,
  },
  propAmass: { fontSize: 12, fontWeight: "800", color: colors.ink, letterSpacing: 0.4 },
  propAddr: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  card: { padding: 14, borderRadius: radius.md, backgroundColor: "#fff", gap: 8 },
  stepTitle: { ...typography.h2, fontSize: 15 },
  stepSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  hint: { fontSize: 11, color: colors.textTertiary, fontStyle: "italic" },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  gpsTierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  gpsTierText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  gpsCoords: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.text, fontFamily: "monospace" as any },
  gpsAcc: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  photoWrap: { position: "relative", marginTop: 8 },
  photoImg: { width: "100%", height: 180, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  photoRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  verdictRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginTop: 4,
  },
  verdictRowActive: { backgroundColor: "#FFEDED", borderWidth: 1.5, borderColor: colors.red },
  verdictIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  verdictLabel: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.text },
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
  },
  reviewRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  reviewLbl: {
    width: 80,
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  reviewVal: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.text },
  navRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: radius.pill,
  },
  primary: { backgroundColor: colors.red },
  secondary: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.border },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
});
