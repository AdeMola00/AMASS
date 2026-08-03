import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

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
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const [property, setProperty] = useState<any>(null);
  const [goals, setGoals] = useState("");
  const [budget, setBudget] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [preferredDate, setPreferredDate] = useState<string>("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    api
      .improveProperty(propertyId as string)
      .then((res) => setProperty(res.property))
      .catch(() => {});
  }, [propertyId]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access to upload photos.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
      allowsMultipleSelection: false,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.base64) return;
    if (photos.length >= 12) {
      Alert.alert("Max 12 photos", "You've reached the photo limit.");
      return;
    }
    setPhotos((prev) => [...prev, `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`]);
    Haptics.selectionAsync().catch(() => {});
  };

  const submit = async () => {
    if (!goals.trim() || !phone.trim()) {
      Alert.alert("Missing details", "Please describe your renovation goals and add a phone number.");
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
        notes: notes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Inspection requested",
        "Our team will reach out shortly to schedule your on-site visit.",
        [{ text: "View", onPress: () => router.replace(`/improve/inspection/${res.id}` as any) }]
      );
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Request Inspection</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        {property && (
          <View style={styles.propCard}>
            <Image source={{ uri: property.images?.[0] }} style={styles.propImg} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.propTitle} numberOfLines={1}>{property.title}</Text>
              <Text style={styles.propMeta} numberOfLines={1}>{property.location}</Text>
              <Text style={styles.propPrice}>{formatNaira(property.price)}</Text>
            </View>
          </View>
        )}

        <SectionTitle>Renovation goals *</SectionTitle>
        <TextInput
          value={goals}
          onChangeText={setGoals}
          placeholder="e.g. modernize kitchen, add en-suite bathroom, repaint interior, install solar"
          placeholderTextColor={colors.textTertiary}
          multiline
          style={[styles.input, styles.inputMulti]}
          testID="input-goals"
        />

        <SectionTitle>Budget hint (₦, optional)</SectionTitle>
        <TextInput
          value={budget}
          onChangeText={setBudget}
          placeholder="e.g. 15,000,000"
          placeholderTextColor={colors.textTertiary}
          keyboardType="numeric"
          style={styles.input}
        />

        <SectionTitle>Contact phone *</SectionTitle>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+2348012345678"
          placeholderTextColor={colors.textTertiary}
          keyboardType="phone-pad"
          style={styles.input}
        />

        <SectionTitle>Preferred inspection date</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {DATES().map((d) => {
            const active = preferredDate === d.key;
            return (
              <Pressable
                key={d.key}
                onPress={() => setPreferredDate(active ? "" : d.key)}
                style={[styles.dateTile, active && styles.dateTileActive]}
              >
                <Text style={[styles.dateLabel, active && { color: "#fff" }]}>{d.label}</Text>
                <Text style={[styles.dateSub, active && { color: "rgba(255,255,255,0.85)" }]}>{d.sub}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <SectionTitle>Photos ({photos.length}/12)</SectionTitle>
        <View style={styles.photoGrid}>
          {photos.map((p, i) => (
            <View key={i} style={styles.photo}>
              <Image source={{ uri: p }} style={styles.photoImg} contentFit="cover" />
              <Pressable
                onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                style={styles.photoRemove}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
          {photos.length < 12 && (
            <Pressable onPress={pickPhoto} style={styles.photoAdd} testID="add-photo">
              <Ionicons name="add" size={22} color={colors.text} />
              <Text style={styles.photoAddText}>Add</Text>
            </Pressable>
          )}
        </View>

        <SectionTitle>Notes for the inspector (optional)</SectionTitle>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything else the inspector should know?"
          placeholderTextColor={colors.textTertiary}
          multiline
          style={[styles.input, styles.inputMulti]}
        />

        <View style={styles.trustRow}>
          <Ionicons name="shield-checkmark" size={14} color="#22C55E" />
          <Text style={styles.trustText}>
            AMASS-verified inspectors. Report ready within 3-5 business days.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={submit}
          disabled={submitting}
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          testID="submit-inspection"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="clipboard" size={16} color="#fff" />
              <Text style={styles.submitText}>Request Inspection</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  propCard: {
    flexDirection: "row", gap: 12, alignItems: "center",
    margin: spacing.lg, padding: 12, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    ...shadows.soft,
  },
  propImg: { width: 60, height: 60, borderRadius: 12, backgroundColor: colors.surfaceSecondary },
  propTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  propMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 3 },
  propPrice: { fontSize: 13, fontWeight: "900", color: colors.text, marginTop: 4 },

  sectionTitle: {
    marginHorizontal: spacing.lg,
    marginTop: 16, marginBottom: 8,
    fontSize: 12, fontWeight: "800", color: colors.text,
    letterSpacing: 0.3, textTransform: "uppercase",
  },
  input: {
    marginHorizontal: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: "#fff", borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.text,
  },
  inputMulti: { minHeight: 90, textAlignVertical: "top" },

  dateRow: { gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 4 },
  dateTile: {
    minWidth: 68, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: "#fff", alignItems: "center", gap: 2,
  },
  dateTileActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  dateLabel: { fontSize: 12, fontWeight: "800", color: colors.text },
  dateSub: { fontSize: 10, color: colors.textTertiary, fontWeight: "600" },

  photoGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    paddingHorizontal: spacing.lg,
  },
  photo: {
    width: 72, height: 72, borderRadius: radius.sm,
    overflow: "hidden", position: "relative",
  },
  photoImg: { width: "100%", height: "100%", backgroundColor: colors.surfaceSecondary },
  photoRemove: {
    position: "absolute", top: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  photoAdd: {
    width: 72, height: 72, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 2,
    backgroundColor: "#fff",
  },
  photoAddText: { fontSize: 10, color: colors.textSecondary, fontWeight: "700" },

  trustRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: spacing.lg, marginTop: 16, padding: 10, borderRadius: radius.md,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
  },
  trustText: { flex: 1, fontSize: 11, color: "#15803D", fontWeight: "700" },

  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 34,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  submitBtn: {
    height: 54, borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.2 },
});
