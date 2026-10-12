/**
 * Agent — Verify Existing Lead Wizard (Phase D-5)
 * On-site verification flow: GPS capture → photo → verdict → notes → submit.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Image as RNImage, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Input, ProgressBar, Screen, ScreenHeader, Sheet, Skeleton, useToast, type BadgeTone, type IconName } from "@/src/ui";

type Verdict =
  | "PROPERTY_EXISTS"
  | "DIFFERENT_ADDRESS"
  | "IS_DUPLICATE"
  | "NOT_A_PROPERTY"
  | "INACCESSIBLE";

type Step = "gps" | "photo" | "verdict" | "review";
const STEPS: { key: Step; label: string; icon: IconName }[] = [
  { key: "gps", label: "GPS", icon: "locate" },
  { key: "photo", label: "Photo", icon: "camera" },
  { key: "verdict", label: "Verdict", icon: "checkmark-done" },
  { key: "review", label: "Review", icon: "cloud-upload" },
];

function gpsTier(accuracy: number | null): { label: string; tone: BadgeTone; hint: string } {
  if (accuracy == null) return { label: "Unknown", tone: "neutral", hint: "Waiting for GPS…" };
  if (accuracy <= 10) return { label: "Excellent", tone: "success", hint: "Locked to ±10m." };
  if (accuracy <= 25) return { label: "Good", tone: "warning", hint: "Move to open sky for a sharper fix." };
  if (accuracy <= 50) return { label: "Poor", tone: "error", hint: "Signal is weak — try stepping outside." };
  return { label: "Invalid", tone: "error", hint: "GPS accuracy too poor to submit." };
}

const VERDICTS: { key: Verdict; label: string; hint: string; icon: IconName; tone: BadgeTone }[] = [
  { key: "PROPERTY_EXISTS", label: "Property exists as described", hint: "Address, type and entrance all match.", icon: "checkmark-circle", tone: "success" },
  { key: "DIFFERENT_ADDRESS", label: "Different address at pin", hint: "The pin lands on another building.", icon: "swap-horizontal", tone: "warning" },
  { key: "IS_DUPLICATE", label: "Duplicate of another AMASS property", hint: "You'll enter the matching AMASS ID.", icon: "git-merge", tone: "brand" },
  { key: "NOT_A_PROPERTY", label: "Not a residential / commercial property", hint: "Empty lot, road, or non-property.", icon: "close-circle", tone: "error" },
  { key: "INACCESSIBLE", label: "Inaccessible right now", hint: "Gated or unsafe — task reopens for retry.", icon: "hourglass", tone: "neutral" },
];

export default function VerifyWizardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  useAuth(); // ensure auth context is loaded
  const { task_id } = useLocalSearchParams<{ task_id: string }>();

  const [taskData, setTaskData] = useState<Awaited<ReturnType<typeof api.agentVerificationTask>> | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [step, setStep] = useState<Step>("gps");

  // GPS state
  const [locBusy, setLocBusy] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [permSheet, setPermSheet] = useState<"location" | "camera" | null>(null);

  // Photo state
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  // Verdict + notes
  const [verdict, setVerdict] = useState<Verdict>("PROPERTY_EXISTS");
  const [notes, setNotes] = useState("");
  const [dupOfAmassId, setDupOfAmassId] = useState("");
  const [dupError, setDupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!task_id) return;
    try {
      const r = await api.agentVerificationTask(String(task_id));
      setTaskData(r);
    } catch (e: any) {
      toast.error("Couldn't load task", e?.message ?? "Try again");
    } finally {
      setTaskLoading(false);
    }
  }, [task_id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const captureGPS = async () => {
    setLocBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        if (!perm.canAskAgain) setPermSheet("location");
        else toast.info("Location needed", "Allow precise location to record where you verified this property.");
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
      toast.error("GPS failed", e?.message ?? "Try again outdoors.");
    } finally {
      setLocBusy(false);
    }
  };

  const pickPhoto = async (fromCamera: boolean) => {
    setPickBusy(true);
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== "granted") {
          if (!perm.canAskAgain) setPermSheet("camera");
          return;
        }
      }
      // Gallery path uses the system Photo Picker — no media-library permission required.
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
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
      setDupError("Enter the AMASS ID this property duplicates.");
      setStep("verdict");
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
      setDone(
        res.task_status === "COMPLETED"
          ? "Verification recorded. The property's status has been updated."
          : `Task marked ${res.task_status.replace(/_/g, " ").toLowerCase()}.`
      );
    } catch (e: any) {
      toast.error("Submit failed", e?.message ?? "Try again");
    } finally {
      setSubmitting(false);
    }
  };

  const tier = gpsTier(coords?.accuracy ?? null);
  const canGoNext =
    (step === "gps" && !!coords && tier.label !== "Invalid") ||
    (step === "photo") ||
    (step === "verdict" && (verdict !== "IS_DUPLICATE" || !!dupOfAmassId.trim()));

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const chosen = VERDICTS.find((v) => v.key === verdict)!;

  return (
    <Screen testID="verify-wizard">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="On-site verification" subtitle={`Step ${stepIndex + 1} of ${STEPS.length} · ${STEPS[stepIndex].label}`} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: 14, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
          {/* Progress */}
          <View style={{ gap: 10 }}>
            <ProgressBar value={(stepIndex + 1) / STEPS.length} tone="brand" />
            <View style={styles.dotsRow}>
              {STEPS.map((s, i) => {
                const reached = i <= stepIndex;
                const current = i === stepIndex;
                return (
                  <View key={s.key} style={styles.dotWrap}>
                    <View style={[styles.dot, { backgroundColor: reached ? colors.brand : colors.surfaceAlt, borderColor: current ? colors.brand : "transparent" }]}>
                      <Ionicons name={s.icon} size={13} color={reached ? colors.onBrand : colors.textMuted} />
                    </View>
                    <AppText variant="micro" color={current ? colors.text : colors.textTertiary} uppercase>{s.label}</AppText>
                  </View>
                );
              })}
            </View>
          </View>

          {taskLoading ? (
            <Skeleton height={64} radius={radii.lg} />
          ) : taskData?.task ? (
            <Card elevation="xs" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.propIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="home" size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="caption" tone="tertiary" tabular>{taskData.task.amass_property_id}</AppText>
                <AppText variant="bodyMedium" numberOfLines={2}>
                  {taskData.task.raw_address ??
                    [taskData.task.area, taskData.task.lga, taskData.task.state].filter(Boolean).join(", ")}
                </AppText>
              </View>
            </Card>
          ) : null}

          {/* STEP 1: GPS */}
          {step === "gps" && (
            <Card elevation="xs" style={{ gap: 12 }}>
              <AppText variant="h3">Capture your GPS</AppText>
              <AppText variant="bodySm" tone="secondary">
                Stand at the property&apos;s front entrance. Best-for-navigation accuracy is required so the pin lands on the right gate.
              </AppText>
              <Button
                label={coords ? "Refresh GPS" : "Capture GPS now"}
                iconLeft="locate"
                variant="brand"
                size="lg"
                fullWidth
                loading={locBusy}
                onPress={captureGPS}
                testID="btn-capture-gps"
              />
              {coords && (
                <View style={[styles.gpsBox, { backgroundColor: colors.surfaceAlt }]}>
                  <View style={styles.gpsRow}>
                    <Badge label={tier.label} tone={tier.tone} icon="navigate" />
                    <AppText variant="caption" tabular style={{ flex: 1 }}>
                      {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                    </AppText>
                    <AppText variant="caption" weight="bold" tabular>±{Math.round(coords.accuracy ?? 0)}m</AppText>
                  </View>
                  <AppText variant="caption" tone="tertiary">{tier.hint}</AppText>
                </View>
              )}
            </Card>
          )}

          {/* STEP 2: Photo */}
          {step === "photo" && (
            <Card elevation="xs" style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppText variant="h3" style={{ flex: 1 }}>Attach a proof photo</AppText>
                <Badge label="Recommended" tone="info" size="xs" />
              </View>
              <AppText variant="bodySm" tone="secondary">
                A shot of the entrance or nearest identifying feature strengthens the verification score.
              </AppText>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  label="Camera"
                  iconLeft="camera"
                  variant="secondary"
                  style={{ flex: 1 }}
                  loading={pickBusy}
                  disabled={Platform.OS === "web"}
                  onPress={() => pickPhoto(true)}
                  testID="btn-camera"
                />
                <Button label="Gallery" iconLeft="images" variant="secondary" style={{ flex: 1 }} disabled={pickBusy} onPress={() => pickPhoto(false)} testID="btn-gallery" />
              </View>
              {photoDataUrl ? (
                <View style={styles.photoWrap}>
                  <RNImage source={{ uri: photoDataUrl }} style={[styles.photoImg, { backgroundColor: colors.surfaceAlt }]} />
                  <Pressable style={styles.photoRemove} onPress={() => setPhotoDataUrl(null)} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <View style={[styles.photoEmpty, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="image-outline" size={26} color={colors.textMuted} />
                  <AppText variant="caption" tone="tertiary">No photo yet — you can still continue</AppText>
                </View>
              )}
            </Card>
          )}

          {/* STEP 3: Verdict */}
          {step === "verdict" && (
            <Card elevation="xs" style={{ gap: 12 }}>
              <AppText variant="h3">What did you find?</AppText>
              <View style={{ gap: 8 }}>
                {VERDICTS.map((v) => {
                  const on = verdict === v.key;
                  const fg = { success: colors.success, warning: colors.warning, brand: colors.brand, error: colors.error, neutral: colors.textSecondary }[v.tone as "success" | "warning" | "brand" | "error" | "neutral"];
                  const bg = { success: colors.successSoft, warning: colors.warningSoft, brand: colors.brandSoft, error: colors.errorSoft, neutral: colors.surfaceAlt }[v.tone as "success" | "warning" | "brand" | "error" | "neutral"];
                  return (
                    <Pressable
                      key={v.key}
                      style={({ pressed }) => [
                        styles.verdictRow,
                        { backgroundColor: on ? bg : colors.surfaceAlt, borderColor: on ? fg : "transparent" },
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => {
                        setVerdict(v.key);
                        setDupError(null);
                        Haptics.selectionAsync().catch(() => {});
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      testID={`verdict-${v.key}`}
                    >
                      <View style={[styles.verdictIcon, { backgroundColor: on ? fg : colors.surface }]}>
                        <Ionicons name={v.icon} size={15} color={on ? "#fff" : fg} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="bodyMedium">{v.label}</AppText>
                        <AppText variant="caption" tone="tertiary">{v.hint}</AppText>
                      </View>
                      <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? fg : colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
              {verdict === "IS_DUPLICATE" && (
                <Input
                  label="Duplicate of AMASS ID"
                  value={dupOfAmassId}
                  onChangeText={(t) => { setDupOfAmassId(t); setDupError(null); }}
                  placeholder="AMASS-LAG-00000123"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  iconLeft="git-merge-outline"
                  error={dupError}
                  testID="input-dup-of"
                />
              )}
              <Input
                label="Notes · optional"
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Gate is set back 20m from the road pin"
                multiline
                testID="input-notes"
              />
            </Card>
          )}

          {/* STEP 4: Review */}
          {step === "review" && (
            <Card elevation="xs" style={{ gap: 4 }}>
              <AppText variant="h3" style={{ marginBottom: 8 }}>Review &amp; submit</AppText>
              <ReviewRow label="Verdict" value={chosen.label} badge={<Badge label={verdict.replace(/_/g, " ")} tone={chosen.tone} icon={chosen.icon} size="xs" />} />
              {coords && (
                <ReviewRow
                  label="GPS"
                  value={`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} · ±${Math.round(coords.accuracy ?? 0)}m`}
                  badge={<Badge label={tier.label} tone={tier.tone} size="xs" />}
                />
              )}
              <ReviewRow label="Photo" value={photoDataUrl ? "Attached" : "None"} />
              {notes.trim() ? <ReviewRow label="Notes" value={notes} /> : null}
              {verdict === "IS_DUPLICATE" && <ReviewRow label="Duplicate of" value={dupOfAmassId || "—"} last />}
              <Button
                label="Submit verification"
                iconLeft="cloud-upload"
                variant="brand"
                size="lg"
                fullWidth
                loading={submitting}
                disabled={!coords}
                onPress={submit}
                style={{ marginTop: 12 }}
                testID="btn-submit"
              />
            </Card>
          )}

          {/* Nav row */}
          <View style={styles.navRow}>
            {step !== "gps" && (
              <Button label="Back" iconLeft="chevron-back" variant="secondary" style={{ flex: 1 }} onPress={() => setStep(STEPS[stepIndex - 1].key)} testID="btn-back" />
            )}
            {step !== "review" && (
              <Button label="Next" iconRight="chevron-forward" style={{ flex: 1 }} disabled={!canGoNext} onPress={() => setStep(STEPS[stepIndex + 1].key)} testID="btn-next" />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Permission blocked → Open Settings */}
      <Sheet visible={!!permSheet} onClose={() => setPermSheet(null)} title={permSheet === "camera" ? "Camera access needed" : "Location access needed"}>
        <AppText variant="body" tone="secondary" style={{ marginBottom: 16 }}>
          {permSheet === "camera"
            ? "To attach a proof photo, allow camera access for AMASS in your device settings."
            : "To record where you verified this property, allow precise location for AMASS in your device settings."}
        </AppText>
        <View style={{ gap: 8 }}>
          <Button label="Open Settings" iconLeft="settings-outline" size="lg" fullWidth onPress={() => { setPermSheet(null); Linking.openSettings(); }} testID="btn-open-settings" />
          <Button label="Not now" variant="ghost" fullWidth onPress={() => setPermSheet(null)} />
        </View>
      </Sheet>

      {/* Success */}
      <Sheet visible={!!done} onClose={() => router.replace("/agent/tasks" as any)} testID="verify-success">
        <View style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
          <View style={[styles.doneIcon, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={30} color={colors.success} />
          </View>
          <AppText variant="h3" align="center">Verification submitted</AppText>
          <AppText variant="bodySm" tone="secondary" align="center" style={{ maxWidth: 300 }}>{done}</AppText>
        </View>
        <Button label="Back to my tasks" size="lg" fullWidth iconLeft="list" onPress={() => router.replace("/agent/tasks" as any)} style={{ marginTop: 20 }} testID="btn-done" />
      </Sheet>
    </Screen>
  );
}

function ReviewRow({ label, value, badge, last }: { label: string; value: string; badge?: React.ReactNode; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.reviewRow, !last && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <AppText variant="label" tone="tertiary" uppercase style={{ width: 84 }}>{label}</AppText>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="bodySm" numberOfLines={3}>{value}</AppText>
        {badge}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 },
  dotWrap: { alignItems: "center", gap: 5, flex: 1 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  propIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  gpsBox: { padding: 12, borderRadius: radii.sm, gap: 6 },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  photoWrap: { position: "relative" },
  photoImg: { width: "100%", height: 200, borderRadius: radii.md },
  photoEmpty: { height: 120, borderRadius: radii.md, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6 },
  photoRemove: { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  verdictRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md, borderWidth: 1.5, minHeight: 64 },
  verdictIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  reviewRow: { flexDirection: "row", gap: 12, paddingVertical: 10, alignItems: "flex-start" },
  navRow: { flexDirection: "row", gap: 8 },
  doneIcon: { width: 68, height: 68, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
