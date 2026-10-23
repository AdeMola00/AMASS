import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IconName } from "../src/ui/icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { api } from "@/src/lib/api";
import { radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { PropertyMarker } from "@/src/components/PropertyMarker";
import { TokenIcon } from "@/src/components/TokenIcon";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { Button, ProgressBar, Screen, ScreenHeader, Sheet, AppText, useToast } from "@/src/ui";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

type Step = 0 | 1 | 2 | 3 | 4;
type ListingType = "buy" | "rent" | "lease" | "shortlet";
type PropertyType = "duplex" | "apartment" | "bungalow" | "land" | "commercial" | "penthouse" | "terrace";

const LISTING_TYPES: { key: ListingType; label: string; icon: IconName; caption: string }[] = [
  { key: "buy", label: "For Sale", icon: "pricetag", caption: "Sell outright" },
  { key: "rent", label: "For Rent", icon: "key", caption: "Yearly rental" },
  { key: "shortlet", label: "Short Let", icon: "calendar", caption: "Nightly stays" },
  { key: "lease", label: "For Lease", icon: "document-text", caption: "Commercial" },
];

const PROPERTY_TYPES: { key: PropertyType; label: string; icon: IconName }[] = [
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

export default function SubmitProperty() {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const toast = useToast();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [limitSheet, setLimitSheet] = useState<{ planName: string; limit: number | null } | null>(null);

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

  // Trust / mandate
  const [isOwner, setIsOwner] = useState(false);
  const [hasMandate, setHasMandate] = useState(false);
  const [mandateOwnerName, setMandateOwnerName] = useState("");
  const [mandateOwnerPhone, setMandateOwnerPhone] = useState("");
  const [mandateType, setMandateType] = useState<"exclusive" | "sole" | "open" | "verbal">("exclusive");

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
  const removeImage = (u: string) => {
    setSelectedImages((s) => s.filter((x) => x !== u));
  };
  const addImages = (uris: string[]) => {
    setSelectedImages((s) => [...s, ...uris].slice(0, 10));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const mandatePayload =
        !isOwner && hasMandate && mandateOwnerName && mandateOwnerPhone
          ? {
              owner_name: mandateOwnerName,
              owner_phone: mandateOwnerPhone,
              mandate_type: mandateType,
            }
          : undefined;
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
        is_owner: isOwner,
        has_mandate: !isOwner && hasMandate,
        mandate: mandatePayload,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`/property/${created.id}`);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      // Detect plan-limit-reached (HTTP 402) and surface an upgrade CTA.
      const msg = String(e?.message || "");
      if (msg.includes("plan_limit_reached") || msg.includes("limit")) {
        // Parse structured detail if present in the error message.
        let planName = "your current plan";
        let limit: number | null = null;
        try {
          const j = JSON.parse(msg.split("::").pop() || "{}");
          if (j?.plan_name) planName = j.plan_name;
          if (j?.limit) limit = j.limit;
        } catch {}
        setLimitSheet({ planName, limit });
      } else {
        toast.error("Couldn't save property", msg || "Please try again");
      }
      // eslint-disable-next-line no-console
      console.warn("submit failed", e?.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen testID="submit-property-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="List a property"
        subtitle={`Step ${step + 1} of 5 · ${["Type", "Details", "Location", "Photos", "Review"][step]}`}
        onBack={prevStep}
        backTestID="submit-back"
      />
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: 4 }}>
        <ProgressBar value={(step + 1) / 5} tone="brand" height={4} />
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
            isOwner={isOwner}
            setIsOwner={setIsOwner}
            hasMandate={hasMandate}
            setHasMandate={setHasMandate}
            mandateOwnerName={mandateOwnerName}
            setMandateOwnerName={setMandateOwnerName}
            mandateOwnerPhone={mandateOwnerPhone}
            setMandateOwnerPhone={setMandateOwnerPhone}
            mandateType={mandateType}
            setMandateType={setMandateType}
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
            addImages={addImages}
            removeImage={removeImage}
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

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: tc.bgElevated, borderTopColor: tc.border }]}>
        <Button
          label={step === 4 ? "Publish listing" : "Continue"}
          iconRight={step === 4 ? "rocket" : "arrow-forward"}
          variant={step === 4 ? "brand" : "primary"}
          size="lg"
          fullWidth
          loading={submitting}
          disabled={!canNext()}
          onPress={step === 4 ? submit : nextStep}
          testID="submit-next-btn"
        />
      </View>

      <Sheet visible={!!limitSheet} onClose={() => setLimitSheet(null)} title="Listing limit reached">
        <AppText variant="body" tone="secondary" style={{ marginBottom: 16 }}>
          {limitSheet?.limit
            ? `You've reached your ${limitSheet.limit}-property limit on ${limitSheet.planName}. Upgrade to add more listings.`
            : "You've reached your listing limit. Upgrade to add more."}
        </AppText>
        <View style={{ gap: 8 }}>
          <Button label="Upgrade plan" iconLeft="pricetags" variant="premium" size="lg" fullWidth onPress={() => { setLimitSheet(null); router.push("/agent-plans"); }} testID="limit-upgrade" />
          <Button label="Not now" variant="ghost" fullWidth onPress={() => setLimitSheet(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

// ─── Step 0: type ────────────────────────────────────────
function Step0({
  listingType,
  setListingType,
  propertyType,
  setPropertyType,
  isOwner,
  setIsOwner,
  hasMandate,
  setHasMandate,
  mandateOwnerName,
  setMandateOwnerName,
  mandateOwnerPhone,
  setMandateOwnerPhone,
  mandateType,
  setMandateType,
}: any) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={{ gap: spacing.xl }}>
      <View>
        <Text style={styles.h1}>Who&apos;s selling this?</Text>
        <Text style={styles.sub}>
          AMASS shows this on every listing so buyers know your authority to market it.
        </Text>
      </View>

      <View style={styles.trustBox}>
        <Text style={styles.trustQ}>Are you the property owner?</Text>
        <View style={styles.mandateOpts}>
          <Pressable
            onPress={() => setIsOwner(true)}
            style={[styles.mandateOpt, isOwner && styles.mandateOptOn]}
            testID="sp-owner-yes"
            accessibilityRole="radio"
            accessibilityState={{ selected: isOwner }}
          >
            <Ionicons name="checkmark-circle" size={18} color={isOwner ? "#fff" : colors.emerald} />
            <Text style={[styles.mandateOptText, isOwner && { color: "#fff" }]}>Yes, I&apos;m the owner</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsOwner(false)}
            style={[styles.mandateOpt, !isOwner && styles.mandateOptOff]}
            testID="sp-owner-no"
            accessibilityRole="radio"
            accessibilityState={{ selected: !isOwner }}
          >
            <Ionicons name="person-outline" size={18} color={!isOwner ? "#fff" : colors.textSecondary} />
            <Text style={[styles.mandateOptText, !isOwner && { color: "#fff" }]}>No, I&apos;m an agent</Text>
          </Pressable>
        </View>

        {!isOwner && (
          <>
            <Text style={styles.trustQ}>Do you have the owner&apos;s mandate?</Text>
            <View style={styles.mandateOpts}>
              <Pressable
                onPress={() => setHasMandate(true)}
                style={[styles.mandateOpt, hasMandate && styles.mandateOptOn]}
                testID="sp-mandate-yes"
                accessibilityRole="radio"
                accessibilityState={{ selected: hasMandate }}
              >
                <Ionicons name="shield-checkmark" size={18} color={hasMandate ? "#fff" : colors.emerald} />
                <Text style={[styles.mandateOptText, hasMandate && { color: "#fff" }]}>Yes</Text>
              </Pressable>
              <Pressable
                onPress={() => setHasMandate(false)}
                style={[styles.mandateOpt, !hasMandate && styles.mandateOptWarn]}
                testID="sp-mandate-no"
                accessibilityRole="radio"
                accessibilityState={{ selected: !hasMandate }}
              >
                <Ionicons name="alert-circle" size={18} color={!hasMandate ? "#fff" : colors.gold} />
                <Text style={[styles.mandateOptText, !hasMandate && { color: "#fff" }]}>No</Text>
              </Pressable>
            </View>

            {hasMandate && (
              <View style={{ gap: 10 }}>
                <Field label="Owner name" value={mandateOwnerName} onChangeText={setMandateOwnerName} testID="sp-owner-name" />
                <Field label="Owner phone" value={mandateOwnerPhone} onChangeText={setMandateOwnerPhone} keyboardType="phone-pad" testID="sp-owner-phone" />
                <Text style={styles.fieldLabel}>Mandate type</Text>
                <View style={styles.chipWrap}>
                  {(["exclusive", "sole", "open", "verbal"] as const).map((m) => {
                    const on = mandateType === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setMandateType(m)}
                        style={[styles.chip, on && styles.chipActive]}
                        testID={`sp-mtype-${m}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${m} mandate`}
                      >
                        <Text style={[styles.chipText, on && { color: "#fff" }]}>{m.toUpperCase()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.trustHint}>
                  Mandates are reviewed by AMASS. Once approved, your listing gets the blue “Verified Mandated Agent” badge.
                </Text>
              </View>
            )}

            {!hasMandate && (
              <View style={styles.warn}>
                <Ionicons name="alert-circle" size={16} color={colors.gold} />
                <Text style={styles.warnText}>
                  This listing will be shown as “Independent Agent” with a trust warning to buyers.
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      <View>
        <Text style={styles.h2}>Listing type</Text>
      </View>
      <View style={styles.grid2}>
        {LISTING_TYPES.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.gridCard, listingType === t.key && styles.gridCardActive]}
            onPress={() => setListingType(t.key)}
            testID={`listing-${t.key}`}
            accessibilityRole="button"
            accessibilityState={{ selected: listingType === t.key }}
            accessibilityLabel={t.label}
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
      </View>
      <View style={styles.chipWrap}>
        {PROPERTY_TYPES.map((p) => (
          <Pressable
            key={p.key}
            style={[styles.chip, propertyType === p.key && styles.chipActive]}
            onPress={() => setPropertyType(p.key)}
            testID={`ptype-${p.key}`}
            accessibilityRole="button"
            accessibilityState={{ selected: propertyType === p.key }}
            accessibilityLabel={p.label}
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
function AiDescriptionButton({
  title,
  propertyType,
  bedrooms,
  bathrooms,
  sizeSqm,
  location,
  onGenerated,
}: {
  title?: string;
  propertyType?: string;
  bedrooms?: string;
  bathrooms?: string;
  sizeSqm?: string;
  location?: string;
  onGenerated: (text: string) => void;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { wallet, refresh } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const balance = wallet?.spendable ?? 0;
  const COST = 5;

  const generate = async () => {
    if (!title) {
      toast.info("Add a title first", "Give your listing a title, then let AI write the rest.");
      return;
    }
    if (balance < COST) {
      toast.error("Not enough MASS", `You need ${COST} MASS to generate. You have ${balance}.`);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy(true);
    try {
      const r = await api.aiDescription({
        title,
        property_type: propertyType,
        bedrooms: bedrooms ? Number(bedrooms) : undefined,
        bathrooms: bathrooms ? Number(bathrooms) : undefined,
        size_sqm: sizeSqm ? Number(sizeSqm) : undefined,
        location,
        tone: "luxurious",
      });
      onGenerated(r.description);
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("AI unavailable", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable style={styles.aiBtn} onPress={generate} disabled={busy} testID="ai-desc-btn" accessibilityRole="button" accessibilityLabel="Generate description with AI" accessibilityState={{ busy, disabled: busy }}>
      {busy ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <Ionicons name="sparkles" size={12} color="#fff" />
          <Text style={styles.aiBtnText}>AI · {COST}</Text>
          <TokenIcon size={10} tone="gold" />
        </>
      )}
    </Pressable>
  );
}

function Step1(props: any) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Text style={styles.h1}>Tell us about it</Text>
        <Text style={styles.sub}>The essentials buyers will see first.</Text>
      </View>
      <Field label="Listing title" value={props.title} onChangeText={props.setTitle} placeholder="e.g. Ocean-view duplex, Lekki Phase 1" testID="input-title" />
      <View>
        <View style={styles.aiDescRow}>
          <Text style={styles.fieldLabel}>Description</Text>
          <AiDescriptionButton
            title={props.title}
            propertyType={props.propertyType}
            bedrooms={props.bedrooms}
            bathrooms={props.bathrooms}
            sizeSqm={props.sizeSqm}
            location={props.city}
            onGenerated={props.setDescription}
          />
        </View>
        <TextInput
          value={props.description}
          onChangeText={props.setDescription}
          placeholder="Highlight what makes this property special…"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
          testID="input-description"
          multiline
          numberOfLines={4}
        />
      </View>
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
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
            <PropertyMarker
              property={{
                id: "preview",
                status: "premium",
                verified: true,
                is_amass_exclusive: true,
                listing_type: "buy",
                property_type: "duplex",
              } as any}
              label="Your pin"
              active
            />
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
  addImages,
  removeImage,
}: any) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [picking, setPicking] = useState<null | "library" | "camera">(null);

  const pickFromLibrary = async () => {
    setPicking("library");
    try {
      // System Photo Picker — no media-library permission required.
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 8,
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled) {
        const uris = res.assets
          .map((a) => (a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri))
          .filter(Boolean);
        addImages(uris);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } catch {
      /* ignore */
    } finally {
      setPicking(null);
    }
  };

  const captureFromCamera = async () => {
    setPicking("camera");
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setPicking(null);
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled) {
        const a = res.assets[0];
        const uri = a?.base64 ? `data:image/jpeg;base64,${a.base64}` : a?.uri;
        if (uri) {
          addImages([uri]);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }
    } catch {
      /* ignore */
    } finally {
      setPicking(null);
    }
  };

  return (
    <View style={{ gap: spacing.xl }}>
      <View>
        <Text style={styles.h1}>Highlights & photos</Text>
        <Text style={styles.sub}>Select amenities and add photos for the listing.</Text>
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
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={a}
              >
                {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                <Text style={[styles.chipText, on && { color: "#fff" }]}>{a}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={styles.h2}>Photos ({selectedImages.length}/10)</Text>
        <Text style={styles.sub}>
          Add high-quality shots that highlight the property. First photo is the cover.
        </Text>

        <View style={styles.pickerRow}>
          <Pressable
            onPress={pickFromLibrary}
            disabled={!!picking || selectedImages.length >= 10}
            style={[styles.pickerBtn, (picking === "library") && { opacity: 0.5 }]}
            testID="picker-library"
            accessibilityRole="button"
            accessibilityLabel="Choose photos from gallery"
          >
            {picking === "library" ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="images" size={20} color={colors.text} />
                <Text style={styles.pickerBtnText}>Gallery</Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={captureFromCamera}
            disabled={!!picking || selectedImages.length >= 10 || Platform.OS === "web"}
            style={[
              styles.pickerBtn,
              (picking === "camera" || Platform.OS === "web") && { opacity: 0.5 },
            ]}
            testID="picker-camera"
            accessibilityRole="button"
            accessibilityLabel="Take a photo"
          >
            {picking === "camera" ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="camera" size={20} color={colors.text} />
                <Text style={styles.pickerBtnText}>Camera</Text>
              </>
            )}
          </Pressable>
        </View>

        {selectedImages.length === 0 ? (
          <View style={styles.emptyPhotos} testID="photos-empty">
            <Ionicons name="camera-outline" size={30} color={colors.textMuted} />
            <Text style={styles.emptyPhotosText}>No photos yet — add at least one to continue.</Text>
          </View>
        ) : (
          <View style={styles.photoGrid}>
            {selectedImages.map((u: string, idx: number) => (
              <View key={`${idx}-${u.substring(0, 24)}`} style={styles.photoWrap}>
                <Image source={{ uri: u }} style={styles.photo} contentFit="cover" />
                {idx === 0 && (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverBadgeText}>COVER</Text>
                  </View>
                )}
                <Pressable
                  onPress={() => removeImage(u)}
                  style={styles.removeBtn}
                  hitSlop={8}
                  testID={`remove-photo-${idx}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${idx + 1}`}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Step 4: review ──────────────────────────────────────
function Step4({ data }: any) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  trustBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    gap: 12,
  },
  trustQ: { fontSize: 14, fontWeight: "800", color: colors.text },
  mandateOpts: { flexDirection: "row", gap: 8 },
  mandateOpt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  mandateOptOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  mandateOptOff: { backgroundColor: colors.ink, borderColor: colors.ink },
  mandateOptWarn: { backgroundColor: colors.gold, borderColor: colors.gold },
  mandateOptText: { fontSize: 13, fontWeight: "800", color: colors.text },
  trustHint: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  warn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.goldLight,
  },
  warnText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 17 },
  row2: { flexDirection: "row", gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.3, marginLeft: 4 },
  aiDescRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.red,
    minWidth: 70,
    justifyContent: "center",
  },
  aiBtnText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
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
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  photoWrap: {
    width: "48%",
    aspectRatio: 1.3,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    position: "relative",
  },
  photo: { width: "100%", height: "100%" },
  coverBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: colors.red,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  coverBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  pickerBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pickerBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  emptyPhotos: {
    marginTop: 12,
    padding: 24,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  emptyPhotosText: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: "center",
    fontWeight: "500",
  },
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
    backgroundColor: colors.surface,
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
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
