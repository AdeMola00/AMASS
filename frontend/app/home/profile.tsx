/**
 * My Home Profile — photo, name, type, address, ownership, rooms and who lives here.
 * Everything is optional; the dashboard hero shows whatever is filled in.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { ApiError } from "@/src/lib/api";
import { authedImageSource } from "@/src/lib/pickImage";
import { homeApi, homeHubSignal, uploadFile, type FileRef, type Home, type HomeKind, type Ownership } from "@/src/lib/homeHub";
import { AppText, Chip, Input, Screen, SkeletonRows, useToast } from "@/src/ui";
import { ChipRow, HOME_COLORS, HOME_KINDS, HOME_KIND_ICON } from "@/src/components/home/HomeBits";
import { DateField } from "@/src/components/home/Calendar";
import { Field, FormShell } from "@/src/components/home/FormBits";
import { AttachSheet } from "@/src/components/home/AttachSheet";
import { HOME_HERO, OWNERSHIP } from "@/src/components/home/homeArt";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

function Counter({ label, value, onChange, icon, testID }: { label: string; value: number | null; onChange: (v: number | null) => void; icon: string; testID: string }) {
  const { colors } = useTheme();
  const n = value ?? 0;
  return (
    <View style={[styles.counter, { backgroundColor: colors.surfaceAlt }]} testID={testID}>
      <Ionicons name={icon as any} size={18} color={colors.textSecondary} />
      <AppText variant="bodySm" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Pressable onPress={() => onChange(n > 0 ? n - 1 : null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Fewer ${label}`} style={[styles.stepBtn, { backgroundColor: colors.surface }]} testID={`${testID}-minus`}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <AppText variant="title" tabular style={{ minWidth: 26, textAlign: "center" }} testID={`${testID}-value`}>
        {value == null ? "–" : value}
      </AppText>
      <Pressable onPress={() => onChange(Math.min(50, n + 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More ${label}`} style={[styles.stepBtn, { backgroundColor: colors.surface }]} testID={`${testID}-plus`}>
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

export default function HomeProfile() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const { homes, homeId: selectedId, ready, reload } = useSelectedHome();
  const id = params.id || (selectedId !== "all" ? selectedId : null) || homes.find((h) => h.is_default)?.id || homes[0]?.id || null;
  const [home, setHome] = useState<Home | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<HomeKind>("flat");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [color, setColor] = useState<string>(HOME_COLORS[0]);
  const [photo, setPhoto] = useState<FileRef | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [attach, setAttach] = useState(false);
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [bedrooms, setBedrooms] = useState<number | null>(null);
  const [bathrooms, setBathrooms] = useState<number | null>(null);
  const [adults, setAdults] = useState<number | null>(null);
  const [children, setChildren] = useState<number | null>(null);
  const [pets, setPets] = useState<boolean | null>(null);
  const [movedIn, setMovedIn] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!ready || !id) return;
    const h = homes.find((x) => x.id === id);
    if (!h) return;
    setHome(h);
    setName(h.name);
    setKind(h.kind);
    setAddress(h.address ?? "");
    setCity(h.city ?? "");
    setColor(h.color);
    setPhoto(h.photo ?? null);
    setOwnership(h.ownership ?? null);
    setBedrooms(h.bedrooms ?? null);
    setBathrooms(h.bathrooms ?? null);
    setAdults(h.adults ?? null);
    setChildren(h.children ?? null);
    setPets(h.pets ?? null);
    setMovedIn(h.moved_in ?? null);
    if (h.photo?.url) authedImageSource(h.photo.url).then((s) => s && setPreview(s.uri));
  }, [ready, id, homes]);

  const errors = useMemo(() => ({ name: !name.trim() ? "Give your home a name" : null }), [name]);
  const uploading = progress != null && progress < 1;

  const save = async () => {
    setTried(true);
    if (errors.name || !id || uploading) return;
    setSaving(true);
    try {
      await homeApi.updateHome(id, { name: name.trim(), kind, address: address.trim() || null, city: city.trim() || null, color, is_default: home?.is_default, photo, ownership, bedrooms, bathrooms, adults, children, pets, moved_in: movedIn });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await reload();
      homeHubSignal.bump();
      toast.success("Home profile saved");
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/home" as any);
    } catch (e: any) {
      toast.error("Couldn't save your home", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!ready || (id && !home))
    return (
      <Screen testID="home-profile-loading">
        <SkeletonRows rows={6} />
      </Screen>
    );

  return (
    <FormShell title="My Home Profile" subtitle="Photo, address, rooms and who lives here" onSave={save} saveLabel="Save profile" saving={saving} disabled={uploading} testID="home-profile-form">
      {/* Photo */}
      <Pressable onPress={() => setAttach(true)} disabled={uploading} accessibilityRole="button" accessibilityLabel={photo ? "Change home photo" : "Add a home photo"} style={styles.photo} testID="home-profile-photo">
        <Image source={preview ? { uri: preview } : HOME_HERO} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        <View style={styles.photoShade} />
        <View style={styles.photoCta}>
          <Ionicons name="camera" size={18} color="#111111" />
          <AppText variant="caption" color="#111111">
            {uploading ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : photo || preview ? "Change photo" : "Add a photo of your home"}
          </AppText>
        </View>
      </Pressable>
      {photo && !uploading ? (
        <Pressable
          onPress={() => {
            setPhoto(null);
            setPreview(null);
          }}
          hitSlop={8}
          accessibilityRole="button"
          style={{ alignSelf: "flex-start", marginTop: -12 }}
          testID="home-profile-photo-remove"
        >
          <AppText variant="caption" tone="error">
            Remove photo
          </AppText>
        </Pressable>
      ) : null}

      <Input label="Home name" value={name} onChangeText={setName} placeholder="e.g. Our flat in Lekki" error={tried ? errors.name : null} size="lg" testID="home-profile-name" />
      <Field label="Type of home">
        <ChipRow options={HOME_KINDS.map((k) => ({ key: k.key as HomeKind, label: k.label, icon: HOME_KIND_ICON[k.key] }))} value={kind} onChange={setKind} testIDPrefix="home-profile-kind" />
      </Field>
      <Input label="Address" value={address} onChangeText={setAddress} placeholder="Street, estate, area" iconLeft="location-outline" testID="home-profile-address" />
      <Input label="City" value={city} onChangeText={setCity} placeholder="e.g. Lagos" iconLeft="navigate-outline" testID="home-profile-city" />
      <Field label="Ownership">
        <ChipRow options={OWNERSHIP.map((o) => ({ key: o.key, label: o.label }))} value={ownership} onChange={setOwnership} allowClear testIDPrefix="home-profile-own" />
      </Field>
      <Field label="Rooms">
        <View style={{ gap: 8 }}>
          <Counter label="Bedrooms" icon="bed-outline" value={bedrooms} onChange={setBedrooms} testID="home-profile-bedrooms" />
          <Counter label="Bathrooms" icon="water-outline" value={bathrooms} onChange={setBathrooms} testID="home-profile-bathrooms" />
        </View>
      </Field>
      <Field label="Who lives here">
        <View style={{ gap: 8 }}>
          <Counter label="Adults" icon="people-outline" value={adults} onChange={setAdults} testID="home-profile-adults" />
          <Counter label="Children" icon="happy-outline" value={children} onChange={setChildren} testID="home-profile-children" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="Pets at home" icon="paw" selected={pets === true} onPress={() => setPets(pets === true ? null : true)} testID="home-profile-pets" />
          </View>
        </View>
      </Field>
      <DateField label="Moved in (optional)" value={movedIn} onChange={setMovedIn} allowClear quick="past" testID="home-profile-moved" />
      <Field label="Colour tag" hint="Used in the home switcher and calendar.">
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          {HOME_COLORS.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="radio" accessibilityState={{ selected: color === c }} accessibilityLabel={`Colour ${c}`} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? colors.text : "transparent" }]} testID={`home-profile-color-${c.replace("#", "")}`}>
              {color === c ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
            </Pressable>
          ))}
        </View>
      </Field>

      <AttachSheet
        visible={attach}
        onClose={() => setAttach(false)}
        title="Home photo"
        photosOnly
        onPicked={async (o) => {
          setPreview(o.previewUri);
          setProgress(0);
          try {
            setPhoto(await uploadFile(o.input, setProgress));
          } catch (e: any) {
            setPreview(null);
            toast.error("Upload failed", e?.message ?? "Check your connection and try again.");
          } finally {
            setProgress(null);
          }
        }}
      />
    </FormShell>
  );
}

const styles = StyleSheet.create({
  photo: { height: 190, borderRadius: radii.xl, overflow: "hidden", justifyContent: "flex-end", padding: 12, backgroundColor: "#222" },
  photoShade: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.18)" },
  photoCta: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, height: 34, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.94)" },
  counter: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, alignItems: "center", justifyContent: "center" },
});
