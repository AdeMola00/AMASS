/**
 * Report a maintenance issue — category, title, details, location, photos, urgent flag.
 */
import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, Estate } from "@/src/lib/api";
import { pickAndUploadImage } from "@/src/lib/pickImage";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Chip, Input, Screen, ScreenHeader, useToast } from "@/src/ui";
import { ToggleRow } from "@/src/components/neighbours/ToggleRow";
import { SR_CATEGORY_ICON } from "@/src/components/neighbours/ServiceRequestRow";
import { AuthedImage } from "@/src/components/neighbours/AuthedImage";

const CATEGORIES = ["plumbing", "electrical", "water", "generator", "security", "waste", "road", "lighting", "cleaning", "other"];

export default function NewServiceRequestScreen() {
  const { estate_id } = useLocalSearchParams<{ estate_id?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [estateId, setEstateId] = useState<string | undefined>(estate_id);
  const [category, setCategory] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loc, setLoc] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .myEstates()
      .then((list) => {
        const ok = list.filter((e) => e.membership?.status === "approved");
        setEstates(ok);
        if (!estateId && ok[0]) setEstateId(ok[0].id);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhoto = async () => {
    if (photos.length >= 3) return;
    setUploading(true);
    try {
      const url = await pickAndUploadImage();
      if (url) setPhotos((p) => [...p, url]);
    } catch (e: any) {
      toast.error("Couldn't upload photo", e?.message);
    } finally {
      setUploading(false);
    }
  };

  const canSend = !!estateId && !!category && title.trim().length >= 3 && desc.trim().length >= 5;
  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const r = await api.serviceRequestCreate({ estate_id: estateId!, category: category!, title: title.trim(), description: desc.trim(), location_label: loc.trim() || undefined, photos, urgent });
      toast.success(urgent ? "Urgent request sent" : "Request sent", "Estate management has been notified.");
      router.replace(`/neighbours/services/${r.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't send request", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="service-new-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Report an issue" subtitle="Goes straight to estate management" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: space[4] }} keyboardShouldPersistTaps="handled">
        {estates.length > 1 ? (
          <View style={{ gap: 6 }}>
            <AppText variant="label" tone="tertiary" uppercase>
              Estate
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {estates.map((e) => (
                <Chip key={e.id} label={e.name} selected={e.id === estateId} onPress={() => setEstateId(e.id)} />
              ))}
            </ScrollView>
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <AppText variant="label" tone="tertiary" uppercase>
            What’s the issue?
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c.charAt(0).toUpperCase() + c.slice(1)} icon={SR_CATEGORY_ICON[c]} selected={category === c} onPress={() => setCategory(c)} tone="fix" testID={`sr-cat-${c}`} />
            ))}
          </View>
        </View>
        <Input label="Summary" value={title} onChangeText={setTitle} placeholder="e.g. Burst pipe at Block C gate" maxLength={100} testID="sr-title" />
        <Input label="Details" value={desc} onChangeText={setDesc} placeholder="When it started, how bad it is, anything management should know…" multiline maxLength={1500} style={{ minHeight: 110, textAlignVertical: "top" }} testID="sr-desc" />
        <Input label="Where (optional)" value={loc} onChangeText={setLoc} placeholder="e.g. Road 4, near the water tank" maxLength={120} iconLeft="location-outline" testID="sr-location" />
        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="tertiary" uppercase>
            Photos · {photos.length}/3
          </AppText>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {photos.map((p, i) => (
              <Pressable key={p} onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Remove photo" testID={`sr-photo-${i}`}>
                <AuthedImage url={p} style={styles.photo} />
                <View style={[styles.remove, { backgroundColor: colors.text }]}>
                  <Ionicons name="close" size={12} color={colors.bg} />
                </View>
              </Pressable>
            ))}
            {photos.length < 3 ? (
              <Pressable onPress={addPhoto} disabled={uploading} style={[styles.photo, styles.add, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Add photo" testID="sr-add-photo">
                <Ionicons name={uploading ? "hourglass-outline" : "camera-outline"} size={22} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <ToggleRow value={urgent} onChange={setUrgent} label="Urgent — safety, flooding, no power or security risk" testID="sr-urgent" />
        <AppText variant="micro" tone="tertiary">
          Your request is visible to you and estate management only. If management brings in a FIXA professional, you’ll see it here.
        </AppText>
        <Button label="Send to management" size="lg" fullWidth disabled={!canSend} loading={busy} onPress={submit} variant="fix" iconLeft="send" testID="sr-submit" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 84, height: 84, borderRadius: radii.md },
  add: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  remove: { position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
