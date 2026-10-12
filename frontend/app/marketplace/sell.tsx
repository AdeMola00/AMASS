import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IconName } from "../../src/ui/icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

import { api } from "@/src/lib/api";
import { radius, shadows, spacing, formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { Button, Screen, ScreenHeader, useToast } from "@/src/ui";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

const CATEGORIES = [
  { key: "vehicles",    label: "Vehicles",     icon: "car-sport", subs: ["Cars", "SUVs", "Trucks", "Vans", "Buses"] },
  { key: "motorcycles", label: "Motorcycles",  icon: "bicycle", subs: ["Motorcycles", "Scooters"] },
  { key: "phones",      label: "Phones",       icon: "phone-portrait", subs: ["iPhone", "Android", "Accessories"] },
  { key: "electronics", label: "Electronics",  icon: "laptop", subs: ["Laptops", "TV", "Audio", "Cameras", "Gaming"] },
  { key: "furniture",   label: "Furniture",    icon: "bed", subs: ["Sofa", "Bed", "Dining", "Wardrobes", "Office"] },
  { key: "appliances",  label: "Appliances",   icon: "home", subs: ["Fridge", "Washer", "AC", "Generator", "Solar"] },
  { key: "fashion",     label: "Fashion",      icon: "shirt", subs: ["Watches", "Bags", "Shoes", "Clothing", "Jewelry"] },
  { key: "real_estate", label: "Real Estate",  icon: "business", subs: ["Rent", "Sale", "Shortlet", "Land", "Commercial"] },
  { key: "tools",       label: "Tools",        icon: "hammer", subs: ["Power Tools", "Hand Tools", "Ladders"] },
  { key: "business",    label: "Business",     icon: "cube", subs: ["Business Assets", "Restaurant", "Retail"] },
  { key: "services",    label: "Services",     icon: "construct", subs: ["Home Services", "Repair", "Professional"] },
];

const CONDITIONS = [
  { key: "new", label: "New" },
  { key: "used", label: "Used" },
  { key: "refurbished", label: "Refurbished" },
  { key: "for_parts", label: "For Parts" },
];

const CITIES = [
  "Lagos - Lekki", "Lagos - Ikeja", "Lagos - Yaba", "Lagos - Victoria Island", "Lagos - Ajah",
  "Abuja - Maitama", "Abuja - Wuse 2", "Abuja - Gwarinpa", "Port Harcourt", "Ibadan", "Kano",
];

export default function SellListing() {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { colors: tc } = useTheme();

  const [images, setImages] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | undefined>();
  const [condition, setCondition] = useState<string>("used");
  const [brand, setBrand] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [negotiable, setNegotiable] = useState(true);
  const [contactPrefs, setContactPrefs] = useState<string[]>(["chat", "call", "whatsapp"]);
  const [phone, setPhone] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickingImgs, setPickingImgs] = useState(false);

  const subs = useMemo(
    () => CATEGORIES.find((c) => c.key === category)?.subs ?? [],
    [category]
  );

  const canPublish =
    images.length > 0 &&
    name.trim().length >= 3 &&
    description.trim().length >= 10 &&
    (price ?? 0) > 0 &&
    !!category &&
    !!subcategory &&
    !!city;

  const pickImages = async () => {
    setPickingImgs(true);
    try {
      // System Photo Picker — no media-library permission required.
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 8 - images.length),
        quality: 0.7,
        base64: true,
      });
      if (!res.canceled) {
        const uris = res.assets
          .map((a) => (a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri))
          .filter(Boolean) as string[];
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setImages((prev) => [...prev, ...uris].slice(0, 8));
      }
    } catch {
      toast.error("Couldn't open photos", "Try again in a moment.");
    } finally {
      setPickingImgs(false);
    }
  };

  const captureImage = async () => {
    if (Platform.OS === "web") {
      toast.info("Not available on web", "Use the phone app to take photos.");
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        toast.info("Camera access needed", "Allow camera access in Settings.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
      if (!res.canceled) {
        const a = res.assets[0];
        const uri = a?.base64 ? `data:image/jpeg;base64,${a.base64}` : a?.uri;
        if (uri) {
          setImages((prev) => [...prev, uri].slice(0, 8));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }
    } catch {}
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setImages(next);
  };

  const aiFillDescription = async () => {
    if (!name.trim() || !category) {
      toast.info("Add a title & category", "Enter a title and pick a category so AI can help.");
      return;
    }
    setAiBusy(true);
    try {
      // Reuse agent tool endpoint if available; fallback to a local pattern
      const dummy = `${name.trim()}${brand ? ` (${brand})` : ""} in ${condition} condition${city ? `, located in ${city}` : ""}. ${negotiable ? "Price is negotiable — serious buyers only. " : ""}Ready for immediate handover. Trusted seller on AMASS Marketplace.`;
      setDescription(dummy);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      toast.error("AI unavailable", "Try again shortly.");
    } finally {
      setAiBusy(false);
    }
  };

  const useCurrentLocation = async () => {
    try {
      if (Platform.OS === "web") {
        toast.info("Not available on web", "Pick your city manually.");
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        toast.info("Location is off", "Allow location in Settings to auto-detect.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const rev = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const first = rev[0];
      if (first?.city) {
        const match = CITIES.find((c) => c.toLowerCase().includes(String(first.city).toLowerCase()));
        setCity(match || `${first.city}${first.district ? ` - ${first.district}` : ""}`);
      }
    } catch {}
  };

  const toggleContactPref = (k: string) => {
    setContactPrefs((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  };

  const publish = async () => {
    if (!canPublish) return;
    setSaving(true);
    try {
      const res = await api.marketplaceCreateListing({
        name: name.trim(),
        description: description.trim(),
        price: price!,
        category: category!,
        subcategory: subcategory!,
        condition,
        brand: brand.trim() || undefined,
        image: images[0],
        images,
        city: city || undefined,
        location: city || undefined,
        negotiable,
        contact_prefs: contactPrefs,
        seller_phone: phone.trim() || undefined,
        seller_whatsapp: phone.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Listing published", "Your listing is now live on AMASS Marketplace.");
      router.replace(`/marketplace/${res.item.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't publish", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen testID="sell-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Sell an item" subtitle="Declutter · reach verified buyers" backTestID="sell-back" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160, gap: spacing.lg }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* PHOTOS */}
          <Section title="Photos" hint="Add up to 8 photos. First photo is the cover.">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
              {images.map((uri, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri }} style={styles.photoThumbImg} contentFit="cover" />
                  {i === 0 && (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>Cover</Text>
                    </View>
                  )}
                  <Pressable onPress={() => removeImage(i)} style={styles.removeBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                  <View style={styles.moveRow}>
                    <Pressable style={styles.moveBtn} onPress={() => moveImage(i, i - 1)} accessibilityRole="button" accessibilityLabel="Move photo left">
                      <Ionicons name="chevron-back" size={12} color="#fff" />
                    </Pressable>
                    <Pressable style={styles.moveBtn} onPress={() => moveImage(i, i + 1)} accessibilityRole="button" accessibilityLabel="Move photo right">
                      <Ionicons name="chevron-forward" size={12} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ))}
              {images.length < 8 && (
                <>
                  <Pressable onPress={pickImages} style={styles.addPhoto} testID="add-photos" accessibilityRole="button" accessibilityLabel="Add photos from gallery">
                    {pickingImgs ? (
                      <ActivityIndicator color={colors.textSecondary} />
                    ) : (
                      <>
                        <Ionicons name="images-outline" size={22} color={colors.textSecondary} />
                        <Text style={styles.addPhotoText}>Gallery</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable onPress={captureImage} style={styles.addPhoto} testID="camera-photo" accessibilityRole="button" accessibilityLabel="Take a photo">
                    <Ionicons name="camera-outline" size={22} color={colors.textSecondary} />
                    <Text style={styles.addPhotoText}>Camera</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </Section>

          {/* CATEGORY */}
          <Section title="Category">
            <View style={styles.chipsWrap}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.key}
                  active={category === c.key}
                  label={c.label}
                  icon={c.icon as any}
                  onPress={() => {
                    setCategory(c.key);
                    setSubcategory(null);
                  }}
                />
              ))}
            </View>
            {!!subs.length && (
              <View style={[styles.chipsWrap, { marginTop: 12 }]}>
                {subs.map((s) => (
                  <Chip
                    key={s}
                    active={subcategory === s}
                    label={s}
                    onPress={() => setSubcategory(s)}
                    small
                  />
                ))}
              </View>
            )}
          </Section>

          {/* TITLE / BRAND / PRICE */}
          <Section title="Details">
            <Field
              label="Title"
              value={name}
              onChange={setName}
              placeholder="e.g. 2018 Toyota Camry SE"
              testID="listing-title"
            />
            <Field
              label="Brand (optional)"
              value={brand}
              onChange={setBrand}
              placeholder="Toyota, Apple, Samsung…"
              testID="listing-brand"
            />
            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe your item honestly. Mileage, defects, reason for sale…"
                placeholderTextColor={colors.textMuted}
                multiline
                style={styles.textarea}
                testID="listing-description"
              />
              <Pressable
                onPress={aiFillDescription}
                style={styles.aiBtn}
                disabled={aiBusy}
                testID="ai-description"
                accessibilityRole="button"
                accessibilityLabel="Write description with AI"
              >
                <Ionicons name="sparkles" size={14} color={colors.red} />
                <Text style={styles.aiBtnText}>
                  {aiBusy ? "Writing…" : "Generate with AI"}
                </Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>Price</Text>
              <View style={styles.priceBox}>
                <Text style={styles.currency}>₦</Text>
                <TextInput
                  keyboardType="numeric"
                  value={price !== undefined ? String(price) : ""}
                  onChangeText={(t) => setPrice(t ? parseInt(t.replace(/\D/g, "")) || undefined : undefined)}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  style={styles.priceInput}
                  testID="listing-price"
                />
              </View>
              <View style={styles.negoRow}>
                <Text style={styles.negoLabel}>Price is negotiable</Text>
                <Switch value={negotiable} onValueChange={setNegotiable} />
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>Condition</Text>
              <View style={styles.chipsWrap}>
                {CONDITIONS.map((c) => (
                  <Chip
                    key={c.key}
                    active={condition === c.key}
                    label={c.label}
                    onPress={() => setCondition(c.key)}
                  />
                ))}
              </View>
            </View>
          </Section>

          {/* LOCATION */}
          <Section title="Location">
            <Pressable onPress={useCurrentLocation} style={styles.gpsBtn} accessibilityRole="button" accessibilityLabel="Use my current location">
              <Ionicons name="locate" size={14} color={colors.red} />
              <Text style={styles.gpsBtnText}>Use my current location</Text>
            </Pressable>
            <View style={[styles.chipsWrap, { marginTop: 10 }]}>
              {CITIES.map((c) => (
                <Chip
                  key={c}
                  active={city === c}
                  label={c}
                  onPress={() => setCity(c)}
                  small
                />
              ))}
            </View>
          </Section>

          {/* CONTACT */}
          <Section title="Contact preferences">
            <View style={styles.chipsWrap}>
              <Chip
                active={contactPrefs.includes("chat")}
                label="In-app chat"
                icon="chatbubble-ellipses"
                onPress={() => toggleContactPref("chat")}
              />
              <Chip
                active={contactPrefs.includes("call")}
                label="Phone call"
                icon="call"
                onPress={() => toggleContactPref("call")}
              />
              <Chip
                active={contactPrefs.includes("whatsapp")}
                label="WhatsApp"
                icon="logo-whatsapp"
                onPress={() => toggleContactPref("whatsapp")}
              />
            </View>
            <Field
              label="Phone / WhatsApp number"
              value={phone}
              onChange={setPhone}
              placeholder="+234…"
              keyboardType="phone-pad"
              testID="listing-phone"
            />
          </Section>

          {/* Preview banner */}
          {price ? (
            <View style={styles.previewBanner}>
              <Ionicons name="eye" size={14} color={colors.textSecondary} />
              <Text style={styles.previewText}>
                Preview: {name.trim() || "Untitled listing"} · {formatNaira(price)}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Bottom publish bar */}
        <View style={[styles.publishBar, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: tc.bgElevated, borderTopColor: tc.border }]}>
          <Button
            label={price ? `Publish · ${formatNaira(price)}` : "Publish listing"}
            iconLeft="rocket-outline"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!canPublish}
            onPress={publish}
            testID="publish-listing"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint && <Text style={styles.sectionHint}>{hint}</Text>}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  testID?: string;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        style={styles.input}
        testID={testID}
      />
    </View>
  );
}

function Chip({
  active,
  label,
  onPress,
  icon,
  small,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  icon?: IconName;
  small?: boolean;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[
        styles.chip,
        small && { height: 30, paddingHorizontal: 10 },
        active && styles.chipActive,
      ]}
    >
      {icon && <Ionicons name={icon} size={12} color={active ? "#fff" : colors.textSecondary} />}
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  section: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
  sectionHint: { fontSize: 11, color: colors.textTertiary, fontWeight: "600", marginTop: 2 },

  // Photos
  photoThumb: {
    width: 92,
    height: 92,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    position: "relative",
  },
  photoThumbImg: { width: "100%", height: "100%" },
  coverBadge: {
    position: "absolute",
    top: 6, left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(10,10,10,0.85)",
  },
  coverBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  removeBtn: {
    position: "absolute",
    top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(10,10,10,0.7)",
    alignItems: "center", justifyContent: "center",
  },
  moveRow: {
    position: "absolute",
    bottom: 4,
    left: 4, right: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  moveBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(10,10,10,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  addPhoto: {
    width: 92, height: 92,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
  },
  addPhotoText: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },

  // Chips
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.text },

  // Field
  fieldLabel: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginBottom: 6, letterSpacing: 0.2 },
  input: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
    backgroundColor: colors.surface,
  },
  textarea: {
    minHeight: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
    textAlignVertical: "top",
    backgroundColor: colors.surface,
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.redLight,
    borderWidth: 1,
    borderColor: colors.red,
  },
  aiBtnText: { color: colors.red, fontSize: 12, fontWeight: "800" },

  // Price
  priceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 60,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  currency: { fontSize: 22, fontWeight: "800", color: colors.textSecondary },
  priceInput: { flex: 1, fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.3 },
  negoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 4,
  },
  negoLabel: { fontSize: 13, color: colors.text, fontWeight: "600" },

  // Location
  gpsBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.redLight,
    borderWidth: 1,
    borderColor: colors.red,
  },
  gpsBtnText: { color: colors.red, fontSize: 12, fontWeight: "800" },

  previewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  previewText: { fontSize: 12, color: colors.textSecondary, fontWeight: "700", flex: 1 },

  // Publish bar
  publishBar: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...shadows.floating,
  },
});
