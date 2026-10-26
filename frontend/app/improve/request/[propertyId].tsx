import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, Input, Screen, ScreenHeader, Sheet, EmptyState, useMoneyRain, useToast } from "@/src/ui";

const DATES = () => {
  const arr: { key: string; label: string; sub: string }[] = [];
  const today = new Date();
  for (let i = 1; i <= 10; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    arr.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      sub: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    });
  }
  return arr;
};

export default function InspectionRequest() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { rain } = useMoneyRain();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const [property, setProperty] = useState<any>(null);
  const [goals, setGoals] = useState("");
  const [budget, setBudget] = useState("");
  const { user } = useAuth();
  const [phone, setPhone] = useState(user?.phone ?? "");
  useEffect(() => {
    // The profile may arrive after first render (direct open / reload) — fill the number once it does, never overwrite typing.
    if (user?.phone) setPhone((p) => (p ? p : user.phone!));
  }, [user?.phone]);
  const [notes, setNotes] = useState("");
  const [preferredDate, setPreferredDate] = useState<string>("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<{ uri: string; duration?: number; size?: number }[]>([]);
  const [pickingVideo, setPickingVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    api
      .improveProperty(propertyId as string)
      .then((res) => setProperty(res.property))
      .catch(() => {});
  }, [propertyId]);

  const pickPhoto = async () => {
    // System Photo Picker — no media-library permission required.
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      base64: true,
      allowsMultipleSelection: false,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.base64) return;
    if (photos.length >= 12) {
      toast.info("Max 12 photos", "You've reached the photo limit.");
      return;
    }
    setPhotos((prev) => [...prev, `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`]);
    Haptics.selectionAsync().catch(() => {});
  };

  const pickVideo = async () => {
    if (videos.length >= 3) {
      toast.info("Max 3 videos", "You've reached the video limit for a single inspection request.");
      return;
    }
    setPickingVideo(true);
    try {
      // System Photo Picker (video tab) — no media-library permission required.
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        quality: 0.5,
        videoMaxDuration: 30, // seconds — keeps payload manageable
        allowsMultipleSelection: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      const size = asset.fileSize ?? 0;
      // Warn if larger than ~15MB — base64 payload is ~33% larger
      if (size > 15 * 1024 * 1024) {
        toast.error("Video too large", "Choose a clip under 30 seconds or 15 MB, or add a link in the notes.");
        return;
      }
      // Read as base64 to match AMASS backend pattern
      let dataUrl = asset.uri;
      try {
        if (Platform.OS === "web") {
          const blob = await fetch(asset.uri).then((r) => r.blob());
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } else {
          const b64 = await new FileSystem.File(asset.uri).base64();
          dataUrl = `data:${asset.mimeType || "video/mp4"};base64,${b64}`;
        }
      } catch {
        // Fall back to raw URI if conversion fails — backend accepts strings
      }
      setVideos((prev) => [...prev, { uri: dataUrl, duration: asset.duration ?? undefined, size }]);
      Haptics.selectionAsync().catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't add video", e?.message ?? "Please try again.");
    } finally {
      setPickingVideo(false);
    }
  };

  const goalsError = touched && !goals.trim() ? "Tell us what you'd like to improve." : null;
  const phoneError = touched && !phone.trim() ? "We need a number to schedule the visit." : null;

  const submit = async () => {
    setTouched(true);
    if (!goals.trim() || !phone.trim()) {
      toast.error("Missing details", "Please describe your renovation goals and add a phone number.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSubmitting(true);
    try {
      const res = await api.createInspection({
        property_id: propertyId as string,
        renovation_goals: goals.trim(),
        budget_hint_ngn: budget ? Number(budget.replace(/,/g, "")) : undefined,
        preferred_date: preferredDate || undefined,
        contact_phone: phone.trim(),
        photos,
        videos: videos.map((v) => v.uri),
        notes: notes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCreatedId(res.id);
      rain({ variant: "subtle", key: `inspection:${res.id}`, once: true });
    } catch (e: any) {
      toast.error("Couldn't submit request", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const budgetNumber = Number(budget.replace(/,/g, "")) || 0;

  return (
    <Screen testID="inspection-request">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Request Inspection" subtitle="Step 1 of your improvement journey" />

      <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled" bottomOffset={120} showsVerticalScrollIndicator={false}>
        {property ? (
          <Card elevation="xs" padded={false} style={{ padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Image source={{ uri: property.images?.[0] }} style={[styles.propImg, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {property.title}
                </AppText>
                <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                  {property.location}
                </AppText>
                <AppText variant="title" tabular>
                  {formatNaira(property.price)}
                </AppText>
              </View>
            </View>
          </Card>
        ) : null}

        <Input
          label="Renovation goals *"
          value={goals}
          onChangeText={setGoals}
          placeholder="e.g. modernise kitchen, add en-suite bathroom, repaint interior, install solar"
          multiline
          error={goalsError}
          testID="input-goals"
        />

        <Input label="Budget hint (₦, optional)" value={budget} onChangeText={setBudget} placeholder="e.g. 15,000,000" keyboardType="numeric" iconLeft="cash-outline" helper={budgetNumber ? `≈ ${formatNaira(budgetNumber)}` : undefined} testID="input-budget" />

        <Input label="Contact phone *" value={phone} onChangeText={setPhone} placeholder="+2348012345678" keyboardType="phone-pad" iconLeft="call-outline" error={phoneError} testID="input-phone" />

        <View style={{ gap: 10 }}>
          <AppText variant="caption" tone="secondary" style={{ marginLeft: 2 }}>
            Preferred inspection date
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {DATES().map((d) => {
              const active = preferredDate === d.key;
              return (
                <Pressable
                  key={d.key}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setPreferredDate(active ? "" : d.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${d.label} ${d.sub}`}
                  style={[styles.dateTile, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }, active && shadows.sm]}
                  testID={`date-${d.key}`}
                >
                  <AppText variant="caption" weight="bold" color={active ? colors.onPrimary : colors.text}>
                    {d.label}
                  </AppText>
                  <AppText variant="micro" color={active ? colors.onPrimary : colors.textTertiary}>
                    {d.sub}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ gap: 10 }}>
          <AppText variant="caption" tone="secondary" style={{ marginLeft: 2 }}>
            Photos · {photos.length}/12
          </AppText>
          <View style={styles.grid}>
            {photos.map((p, i) => (
              <View key={i} style={[styles.photo, { backgroundColor: colors.skeleton }]}>
                <Image source={{ uri: p }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Pressable onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))} style={styles.remove} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={6}>
                  <Ionicons name="close" size={12} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {photos.length < 12 ? (
              <Pressable onPress={pickPhoto} style={[styles.add, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Add photo" testID="add-photo">
                <Ionicons name="camera-outline" size={22} color={colors.text} />
                <AppText variant="micro" tone="secondary">
                  Add
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <AppText variant="caption" tone="secondary" style={{ marginLeft: 2 }}>
            Videos · {videos.length}/3
          </AppText>
          <View style={styles.grid}>
            {videos.map((v, i) => (
              <View key={i} style={[styles.videoTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.videoPreview, { backgroundColor: colors.surfaceInverse }]}>
                  <Ionicons name="play" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.videoMeta}>
                  <Ionicons name="videocam" size={11} color={colors.textTertiary} />
                  <AppText variant="micro" tone="secondary" tabular>
                    {v.duration ? `${Math.round((v.duration || 0) / 1000)}s` : "video"}
                    {v.size ? ` · ${(v.size / (1024 * 1024)).toFixed(1)} MB` : ""}
                  </AppText>
                </View>
                <Pressable onPress={() => setVideos((prev) => prev.filter((_, idx) => idx !== i))} style={styles.remove} accessibilityRole="button" accessibilityLabel="Remove video" hitSlop={6} testID={`remove-video-${i}`}>
                  <Ionicons name="close" size={12} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {videos.length < 3 ? (
              <Pressable onPress={pickVideo} disabled={pickingVideo} style={[styles.add, styles.addVideo, { borderColor: colors.borderStrong, backgroundColor: colors.surface }, pickingVideo && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Add video" testID="add-video">
                <Ionicons name="videocam-outline" size={22} color={colors.text} />
                <AppText variant="micro" tone="secondary">
                  {pickingVideo ? "Adding…" : "Add video"}
                </AppText>
              </Pressable>
            ) : null}
          </View>
          <AppText variant="caption" tone="tertiary">
            Max 30 seconds · 15 MB per clip. Videos help our inspector prep for the visit.
          </AppText>
        </View>

        <Input label="Notes for the inspector (optional)" value={notes} onChangeText={setNotes} placeholder="Anything else the inspector should know?" multiline testID="input-notes" />

        <View style={[styles.trust, { backgroundColor: colors.successSoft }]}>
          <Ionicons name="shield-checkmark" size={16} color={colors.success} />
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
            AMASS-verified inspectors. Your report is ready within 3–5 business days.
          </AppText>
        </View>
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }, shadows.lg]}>
        <Button label="Request inspection" size="lg" fullWidth iconLeft="clipboard" loading={submitting} onPress={submit} testID="submit-inspection" />
      </View>

      <Sheet visible={!!createdId} onClose={() => createdId && router.replace(`/improve/inspection/${createdId}` as any)} testID="inspection-success">
        <EmptyState variant="success" compact title="Inspection requested" body="Our team will reach out shortly to schedule your on-site visit." style={{ paddingBottom: 8 }} />
        <Button label="View request" size="lg" fullWidth iconRight="arrow-forward" onPress={() => createdId && router.replace(`/improve/inspection/${createdId}` as any)} testID="inspection-success-view" />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  propImg: { width: 60, height: 60, borderRadius: radii.sm },
  dateTile: { minWidth: 68, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.md, borderWidth: 1, alignItems: "center", gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: 76, height: 76, borderRadius: radii.sm, overflow: "hidden" },
  remove: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  add: { width: 76, height: 76, borderRadius: radii.sm, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 3 },
  addVideo: { width: 110, height: 110 },
  videoTile: { width: 110, borderRadius: radii.sm, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  videoPreview: { height: 76, alignItems: "center", justifyContent: "center" },
  videoMeta: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  trust: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: space[4], paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
