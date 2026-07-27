import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { PropertyMarker } from "@/src/components/PropertyMarker";

type Step = 0 | 1 | 2 | 3 | 4;
type ListingType = "buy" | "rent" | "lease" | "shortlet";
type PropertyType = "duplex" | "apartment" | "bungalow" | "land" | "commercial" | "penthouse" | "terrace";

const LISTING_TYPES: { key: ListingType; label: string; icon: keyof typeof Ionicons.glyphMap; caption: string }[] = [
  { key: "buy", label: "For Sale", icon: "pricetag", caption: "Sell outright" },
  { key: "rent", label: "For Rent", icon: "key", caption: "Yearly rental" },
  { key: "shortlet", label: "Short Let", icon: "calendar", caption: "Nightly stays" },
  { key: "lease", label: "For Lease", icon: "document-text", caption: "Commercial" },
];

const PROPERTY_TYPES: { key: PropertyType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "duplex", label: "Duplex", icon: "business" },
  { key: "apartment", label: "Apartment", icon: "home" },
  { key: "terrace", label: "Terrace", icon: "grid" },
  { key: "bungalow", label: "Bungalow", icon: "home-outline" },
  { key: "penthouse", label: "Penthouse", icon: "diamond" },
  { key: "land", label: "Land", icon: "leaf" },
  { key: "commercial", label: "Commercial", icon: "briefcase" },
];

const AMENITIES = [
  "Swimming Pool", "Gym", "24/7 Security", "Smart Home", "Solar Power",
  "CCTV", "Borehole", "BQ", "Garden", "Parking", "Furnished", "Elevator",
];

const SAMPLE_IMAGES = [
  "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1200",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200",
  "https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=1200",
  "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200",
];

export default function SubmitProperty() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [listingType, setListingType] = useState<ListingType>("buy");
  const [propertyType, setPropertyType] = useState<PropertyType>("duplex");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [bedrooms, setBedrooms] = useState("3");
  const [bathrooms, setBathrooms] = useState("3");
  const [sizeSqm, setSizeSqm] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [parking, setParking] = useState("2");
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [state, setStateVal] = useState("Lagos");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number }>({ latitude: 6.4361, longitude: 3.4739 });
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  const canNext = (): boolean => {
    if (step === 0) return true;
    if (step === 1) return !!title && !!description && !!price && !!sizeSqm;
    if (step === 2) return !!location && !!city;
    if (step === 3) return selectedImages.length > 0;
    return true;
  };

  const nextStep = () => {
    if (!canNext()) return;
    Haptics.selectionAsync().catch(() => {});
    if (step < 4) setStep(((step + 1) as Step));
  };
  const prevStep = () => {
    Haptics.selectionAsync().catch(() => {});
    if (step > 0) setStep(((step - 1) as Step));
    else router.back();
  };

  const toggleAmenity = (a: string) => {
    setSelectedAmenities((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));
  };
  const toggleImage = (u: string) => {
    setSelectedImages((s) => (s.includes(u) ? s.filter((x) => x !== u) : [...s, u]));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const created = await api.createProperty({
        title,
        description,
        price: parseInt(price.replace(/[^\d]/g, ""), 10) || 0,
        listing_type: listingType,
        property_type: propertyType,
        bedrooms: parseInt(bedrooms, 10) || 0,
        bathrooms: parseInt(bathrooms, 10) || 0,
        size_sqm: parseInt(sizeSqm, 10) || 0,
        location,
        city,
        state,
        latitude: coords.latitude,
        longitude: coords.longitude,
        images: selectedImages,
        amenities: selectedAmenities,
        year_built: yearBuilt ? parseInt(yearBuilt, 10) : undefined,
        parking: parking ? parseInt(parking, 10) : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`/property/${created.id}`);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      // eslint-disable-next-line no-console
      console.warn("submit failed", e?.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="submit-property-screen">
      <View style={styles.header}>
        <Pressable onPress={prevStep} style={styles.back} testID="submit-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.stepText}>Step {step + 1} of 5</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((step + 1) / 5) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.back} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={90}
      >
        {step === 0 && (
          <Step0
            listingType={listingType}
            setListingType={setListingType}
            propertyType={propertyType}
            setPropertyType={setPropertyType}
          />
        )}
        {step === 1 && (
          <Step1
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            price={price}
            setPrice={setPrice}
            bedrooms={bedrooms}
            setBedrooms={setBedrooms}
            bathrooms={bathrooms}
            setBathrooms={setBathrooms}
            sizeSqm={sizeSqm}
            setSizeSqm={setSizeSqm}
            yearBuilt={yearBuilt}
            setYearBuilt={setYearBuilt}
            parking={parking}
            setParking={setParking}
          />
        )}
        {step === 2 && (
          <Step2
            location={location}
            setLocation={setLocation}
            city={city}
            setCity={setCity}
            state={state}
            setState={setStateVal}
            coords={coords}
            setCoords={setCoords}
          />
        )}
        {step === 3 && (
          <Step3
            selectedAmenities={selectedAmenities}
            toggleAmenity={toggleAmenity}
            selectedImages={selectedImages}
            toggleImage={toggleImage}
          />
        )}
        {step === 4 && (
          <Step4
            data={{
              title, description, price, listingType, propertyType,
              bedrooms, bathrooms, sizeSqm, location, city, state,
              selectedAmenities, selectedImages,
            }}
          />
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          onPress={step === 4 ? submit : nextStep}
          disabled={!canNext() || submitting}
          style={[styles.cta, (!canNext() || submitting) && { opacity: 0.4 }]}
          testID="submit-next-btn"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              {step === 4 ? "Publish Listing" : "Continue"}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ─── Step 0: type ────────────────────────────────────────
function Step0({
  listingType,
  setListingType,
  propertyType,
  setPropertyType,
}: any) {
  return (
    <View style={{ gap: spacing.xl }}>
      <View>
        <Text style={styles.h1}>What are you listing?</Text>
        <Text style={styles.sub}>Pick how you want to list this property.</Text>
      </View>
      <View style={styles.grid2}>
        {LISTING_TYPES.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.gridCard, listingType === t.key && styles.gridCardActive]}
            onPress={() => setListingType(t.key)}
            testID={`listing-${t.key}`}
          >
            <Ionicons
              name={t.icon}
              size={22}
              color={listingType === t.key ? "#fff" : colors.text}
            />
            <Text style={[styles.gridLabel, listingType === t.key && { color: "#fff" }]}>{t.label}</Text>
            <Text style={[styles.gridCaption, listingType === t.key && { color: "rgba(255,255,255,0.7)" }]}>
              {t.caption}
            </Text>
          </Pressable>
        ))}
      </View>

      <View>
        <Text style={styles.h2}>Property type</Text>
        <Text style={styles.sub}>What kind of property is this?</Text>
      </View>
      <View style={styles.chipWrap}>
        {PROPERTY_TYPES.map((p) => (
          <Pressable
            key={p.key}
            style={[styles.chip, propertyType === p.key && styles.chipActive]}
            onPress={() => setPropertyType(p.key)}
            testID={`ptype-${p.key}`}
          >
            <Ionicons
              name={p.icon}
              size={14}
              color={propertyType === p.key ? "#fff" : colors.textSecondary}
            />
            <Text style={[styles.chipText, propertyType === p.key && { color: "#fff" }]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Step 1: details ─────────────────────────────────────
function Step1(props: any) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Text style={styles.h1}>Tell us about it</Text>
        <Text style={styles.sub}>The essentials buyers will see first.</Text>
      </View>
      <Field label="Listing title" value={props.title} onChangeText={props.setTitle} placeholder="e.g. Ocean-view duplex, Lekki Phase 1" testID="input-title" />
      <Field
        label="Description"
        value={props.description}
        onChangeText={props.setDescription}
        placeholder="Highlight what makes this property special…"
        testID="input-description"
        multiline
        numberOfLines={4}
      />
      <Field
        label="Price (₦)"
        value={props.price}
        onChangeText={(v: string) => props.setPrice(v.replace(/[^\d]/g, ""))}
        placeholder="145000000"
        keyboardType="numeric"
        testID="input-price"
      />
      <View style={styles.row2}>
        <Field label="Bedrooms" value={props.bedrooms} onChangeText={props.setBedrooms} keyboardType="numeric" testID="input-beds" style={{ flex: 1 }} />
        <Field label="Bathrooms" value={props.bathrooms} onChangeText={props.setBathrooms} keyboardType="numeric" testID="input-baths" style={{ flex: 1 }} />
      </View>
      <View style={styles.row2}>
        <Field label="Size (sqm)" value={props.sizeSqm} onChangeText={props.setSizeSqm} placeholder="380" keyboardType="numeric" testID="input-size" style={{ flex: 1 }} />
        <Field label="Parking" value={props.parking} onChangeText={props.setParking} keyboardType="numeric" testID="input-parking" style={{ flex: 1 }} />
      </View>
      <Field label="Year built (optional)" value={props.yearBuilt} onChangeText={props.setYearBuilt} placeholder="2023" keyboardType="numeric" testID="input-year" />
    </View>
  );
}

// ─── Step 2: location ────────────────────────────────────
function Step2(props: any) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Text style={styles.h1}>Where is it?</Text>
        <Text style={styles.sub}>Address details and pin on the map.</Text>
      </View>
      <Field label="Street / area" value={props.location} onChangeText={props.setLocation} placeholder="Admiralty Way" testID="input-location" />
      <View style={styles.row2}>
        <Field label="City" value={props.city} onChangeText={props.setCity} placeholder="Lekki" testID="input-city" style={{ flex: 1 }} />
        <Field label="State" value={props.state} onChangeText={props.setState} placeholder="Lagos" testID="input-state" style={{ flex: 1 }} />
      </View>

      <Text style={styles.fieldLabel}>Drop the pin</Text>
      <View style={styles.mapPicker}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            latitude: props.coords.latitude,
            longitude: props.coords.longitude,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          }}
          onPress={(e: any) => {
            if (e?.nativeEvent?.coordinate) props.setCoords(e.nativeEvent.coordinate);
          }}
        >
          <Marker
            coordinate={props.coords}
            draggable
            onDragEnd={(e: any) =>
              e?.nativeEvent?.coordinate && props.setCoords(e.nativeEvent.coordinate)
            }
          >
            <PropertyMarker status="premium" label="Your pin" active />
          </Marker>
        </MapView>
      </View>
      <Text style={styles.coordText}>
        {props.coords.latitude.toFixed(5)}, {props.coords.longitude.toFixed(5)}
      </Text>
    </View>
  );
}

// ─── Step 3: amenities + photos ──────────────────────────
function Step3({
  selectedAmenities,
  toggleAmenity,
  selectedImages,
  toggleImage,
}: any) {
  return (
    <View style={{ gap: spacing.xl }}>
      <View>
        <Text style={styles.h1}>Highlights & photos</Text>
        <Text style={styles.sub}>Select amenities and photos for the listing.</Text>
      </View>

      <View>
        <Text style={styles.h2}>Amenities</Text>
        <View style={styles.chipWrap}>
          {AMENITIES.map((a) => {
            const on = selectedAmenities.includes(a);
            return (
              <Pressable
                key={a}
                onPress={() => toggleAmenity(a)}
                style={[styles.chip, on && styles.chipActive]}
                testID={`amenity-${a.replace(/\s+/g, "-")}`}
              >
                {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                <Text style={[styles.chipText, on && { color: "#fff" }]}>{a}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={styles.h2}>Photos ({selectedImages.length} selected)</Text>
        <Text style={styles.sub}>Tap to select photos for your listing.</Text>
        <View style={styles.photoGrid}>
          {SAMPLE_IMAGES.map((u) => {
            const on = selectedImages.includes(u);
            const idx = selectedImages.indexOf(u);
            return (
              <Pressable key={u} onPress={() => toggleImage(u)} style={styles.photoWrap} testID={`photo-${u.substring(u.length - 10)}`}>
                <Image source={{ uri: u }} style={styles.photo} contentFit="cover" />
                <View style={[styles.photoOverlay, on && styles.photoOverlayOn]}>
                  {on && (
                    <View style={styles.photoBadge}>
                      <Text style={styles.photoBadgeText}>{idx + 1}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Step 4: review ──────────────────────────────────────
function Step4({ data }: any) {
  const price = parseInt(data.price || "0", 10);
  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Text style={styles.h1}>Review your listing</Text>
        <Text style={styles.sub}>
          You can edit these details anytime from your agent dashboard.
        </Text>
      </View>

      {data.selectedImages[0] && (
        <View style={[styles.previewImgWrap, shadows.card]}>
          <Image source={{ uri: data.selectedImages[0] }} style={styles.previewImg} contentFit="cover" />
          <View style={styles.previewPrice}>
            <Text style={styles.previewPriceText}>{formatNaira(price)}</Text>
          </View>
        </View>
      )}

      <ReviewRow label="Listing" value={`${data.listingType.toUpperCase()} · ${data.propertyType}`} />
      <ReviewRow label="Title" value={data.title || "—"} />
      <ReviewRow label="Location" value={`${data.location}, ${data.city}, ${data.state}`} />
      <ReviewRow label="Beds / Baths / Size" value={`${data.bedrooms} bd · ${data.bathrooms} ba · ${data.sizeSqm} m²`} />
      <ReviewRow label="Amenities" value={data.selectedAmenities.slice(0, 4).join(" · ") || "None"} />
      <ReviewRow label="Photos" value={`${data.selectedImages.length} attached`} />

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark" size={16} color={colors.red} />
        <Text style={styles.noticeText}>
          Your listing will be published in <Text style={{ fontWeight: "800" }}>Coming Soon</Text> status and
          verified by AMASS within 48 hours before going fully live.
        </Text>
      </View>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function Field({
  label,
  style,
  testID,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string; testID?: string; style?: any }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        style={[styles.input, rest.multiline && { height: 100, textAlignVertical: "top", paddingTop: 14 }]}
        placeholderTextColor={colors.textMuted}
        testID={testID}
      />
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
    gap: spacing.md,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 12, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.4 },
  progressBar: {
    marginTop: 6,
    width: "80%",
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.red, borderRadius: 2 },
  h1: { ...typography.display, fontSize: 28 },
  h2: { ...typography.h2, marginBottom: 8 },
  sub: { ...typography.body, color: colors.textTertiary, marginTop: 6, lineHeight: 22 },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridCard: {
    width: "48%",
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 8,
    backgroundColor: "#fff",
    minHeight: 120,
    justifyContent: "flex-end",
  },
  gridCardActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  gridLabel: { fontSize: 16, fontWeight: "800", color: colors.text },
  gridCaption: { fontSize: 12, color: colors.textTertiary, fontWeight: "500" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  row2: { flexDirection: "row", gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.3, marginLeft: 4 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.text,
    fontWeight: "500",
  },
  mapPicker: {
    height: 240,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  coordText: { textAlign: "center", fontSize: 12, color: colors.textTertiary, fontWeight: "600" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  photoWrap: {
    width: "48%",
    aspectRatio: 1.3,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  photo: { width: "100%", height: "100%" },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    padding: 8,
  },
  photoOverlayOn: {
    backgroundColor: "rgba(225,27,34,0.2)",
    borderWidth: 3,
    borderColor: colors.red,
    borderRadius: radius.md,
  },
  photoBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  photoBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  previewImgWrap: {
    height: 200,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  previewImg: { width: "100%", height: "100%" },
  previewPrice: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  previewPriceText: { fontSize: 16, fontWeight: "800", color: colors.text },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    gap: 12,
  },
  reviewLabel: { fontSize: 13, color: colors.textTertiary, fontWeight: "600" },
  reviewValue: { fontSize: 14, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: spacing.md,
    backgroundColor: colors.redSurface,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  noticeText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cta: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
