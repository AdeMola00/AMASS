import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { api, ApiError, FixaApplyIn } from "@/src/lib/api";
import { pickImageDataUrl } from "@/src/lib/pickImage";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, Chip, Input, Screen, ScreenHeader, SkeletonRows, useCelebrate, useToast } from "@/src/ui";
import { photoUrl } from "@/src/components/social/socialTheme";
import { tradeIcon } from "@/src/components/fixa/FixaBits";

/**
 * Join FIXA — aspiring providers register here. The profile stays hidden from customers until AMASS Admin
 * verifies it (the admin is notified on submit). `?edit=1` re-uses the form to update an existing profile.
 */
export default function JoinFixaScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === "1";
  const { user } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [catQuery, setCatQuery] = useState("");
  const [form, setForm] = useState<FixaApplyIn>({ business_name: "", categories: [], city: "", service_areas: [], phone: "", whatsapp: "", years_experience: 0, bio: "", image: null });
  const [areasText, setAreasText] = useState("");
  const [yearsText, setYearsText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const [cats, me] = await Promise.all([api.fixaCategories(), api.fixaMe().catch(() => null)]);
        setCategories(cats.categories);
        if (me && me.status !== "none" && me.profile) {
          if (!editing && me.status !== "rejected") {
            // Already on FIXA — the dashboard is the right place.
            router.replace("/fixa/provider" as any);
            return;
          }
          const p = me.profile;
          setForm({ business_name: p.display_name, categories: p.categories.length ? p.categories : [p.category], city: p.city ?? "", service_areas: p.service_areas, phone: p.phone ?? "", whatsapp: p.whatsapp ?? "", years_experience: p.years_experience ?? 0, bio: p.bio ?? "", image: p.image ?? null });
          setAreasText(p.service_areas.join(", "));
          setYearsText(p.years_experience ? String(p.years_experience) : "");
        } else {
          setForm((f) => ({ ...f, business_name: user?.full_name ?? "", phone: user?.phone ?? "" }));
        }
      } catch (e: any) {
        toast.error("Couldn't load the form", e?.message ?? "Please try again.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof FixaApplyIn>(k: K, v: FixaApplyIn[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleCat = (c: string) => {
    Haptics.selectionAsync().catch(() => {});
    setForm((f) => {
      const has = f.categories.includes(c);
      if (has) return { ...f, categories: f.categories.filter((x) => x !== c) };
      if (f.categories.length >= 5) {
        toast.info("Up to 5 trades", "Pick the trades you do most.");
        return f;
      }
      return { ...f, categories: [...f.categories, c] };
    });
  };
  const visibleCats = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    const list = q ? categories.filter((c) => c.toLowerCase().includes(q)) : categories;
    // selected first so they never scroll out of sight
    return [...form.categories.filter((c) => list.includes(c) || q === ""), ...list.filter((c) => !form.categories.includes(c))];
  }, [categories, catQuery, form.categories]);

  const pickPhoto = async () => {
    const r = await pickImageDataUrl("library");
    if (!r.ok) {
      if (r.reason !== "cancelled") toast.error("Couldn't pick a photo", "Please try again.");
      return;
    }
    setUploading(true);
    try {
      const up = await api.socialUpload(r.dataUrl);
      set("image", up.url);
    } catch (e: any) {
      toast.error("Upload failed", e?.message ?? "Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.business_name.trim().length < 2) e.business_name = "Enter your name or business name";
    if (!form.categories.length) e.categories = "Pick at least one trade";
    if (form.city.trim().length < 2) e.city = "Which city do you work in?";
    if (form.phone.replace(/[^\d+]/g, "").length < 7) e.phone = "Enter a phone number customers can call";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    const body: FixaApplyIn = {
      ...form,
      business_name: form.business_name.trim(),
      city: form.city.trim(),
      service_areas: areasText.split(/[,·\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 10),
      years_experience: Math.max(0, Math.min(60, Number(yearsText) || 0)),
      whatsapp: form.whatsapp?.trim() || undefined,
      bio: form.bio.trim(),
    };
    try {
      if (editing) {
        await api.fixaUpdateMe(body);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast.success("Profile updated", "Customers see the new details right away.");
      } else {
        await api.fixaApply(body);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        celebrate({ title: "Application sent", icon: "hammer", tone: "fix" });
      }
      router.replace("/fixa/provider" as any);
    } catch (e: any) {
      const msg = e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.";
      toast.error(editing ? "Couldn't save" : "Couldn't send your application", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="fixa-join-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={editing ? "Edit FIXA profile" : "Join FIXA"} subtitle={editing ? "Changes show immediately" : "Free · verified by AMASS Admin"} />
      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={8} />
        </View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 140, gap: space[4] }} keyboardShouldPersistTaps="handled" bottomOffset={80}>
          {!editing ? (
            <Card tone="ink" style={{ gap: 10 }} testID="fixa-join-intro">
              <AppText variant="title" color={colors.textInverse}>
                How FIXA works for pros
              </AppText>
              {[
                { icon: "document-text-outline", text: "Tell us your trades, area and phone number." },
                { icon: "shield-checkmark-outline", text: "AMASS Admin verifies you — you're hidden until then." },
                { icon: "call-outline", text: "Homeowners call, WhatsApp or book you for free." },
                { icon: "star-outline", text: "Finished jobs and ratings build your badges. No fees, ever." },
              ].map((s) => (
                <View key={s.text} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name={s.icon as any} size={16} color={colors.fix} />
                  <AppText variant="bodySm" color="rgba(255,255,255,0.85)" style={{ flex: 1 }}>
                    {s.text}
                  </AppText>
                </View>
              ))}
            </Card>
          ) : null}

          {/* Photo */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Add a profile photo" testID="fixa-join-photo" style={[styles.photo, { backgroundColor: colors.surfaceAlt }]}>
              {form.image ? <Image source={{ uri: photoUrl(form.image) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="camera-outline" size={26} color={colors.textSecondary} />}
              {uploading ? (
                <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" }]}>
                  <AppText variant="micro" color="#fff">
                    Uploading…
                  </AppText>
                </View>
              ) : null}
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="title">Profile photo</AppText>
              <AppText variant="caption" tone="tertiary">
                Optional, but pros with a clear photo get booked more.
              </AppText>
            </View>
          </View>

          <Input label="Your name or business name" value={form.business_name} onChangeText={(v) => set("business_name", v)} placeholder="e.g. Bolu Plumbing Works" error={errors.business_name} testID="fixa-join-name" />

          {/* Trades */}
          <View style={{ gap: 8 }}>
            <AppText variant="bodySm" weight="semibold" tone="secondary">
              Trades you do ({form.categories.length}/5)
            </AppText>
            <Input value={catQuery} onChangeText={setCatQuery} placeholder="Search trades" iconLeft="search" size="md" testID="fixa-join-cat-search" />
            <View style={styles.chips}>
              {visibleCats.slice(0, 30).map((c) => (
                <Chip key={c} label={c} icon={tradeIcon(c)} selected={form.categories.includes(c)} onPress={() => toggleCat(c)} testID={`fixa-join-cat-${c.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} />
              ))}
            </View>
            {errors.categories ? (
              <AppText variant="caption" color={colors.error}>
                {errors.categories}
              </AppText>
            ) : null}
          </View>

          <Input label="City" value={form.city} onChangeText={(v) => set("city", v)} placeholder="e.g. Lagos" error={errors.city} testID="fixa-join-city" />
          <Input label="Areas you cover" value={areasText} onChangeText={setAreasText} placeholder="Lekki, Ajah, Victoria Island" helper="Separate with commas · up to 10" testID="fixa-join-areas" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Input label="Phone" value={form.phone} onChangeText={(v) => set("phone", v)} placeholder="0803 000 0000" keyboardType="phone-pad" error={errors.phone} containerStyle={{ flex: 1 }} testID="fixa-join-phone" />
            <Input label="WhatsApp" value={form.whatsapp ?? ""} onChangeText={(v) => set("whatsapp", v)} placeholder="Same as phone" keyboardType="phone-pad" containerStyle={{ flex: 1 }} testID="fixa-join-whatsapp" />
          </View>
          <Input label="Years of experience" value={yearsText} onChangeText={setYearsText} placeholder="e.g. 7" keyboardType="number-pad" containerStyle={{ width: 180 }} testID="fixa-join-years" />
          <Input label="About you" value={form.bio} onChangeText={(v) => set("bio", v)} placeholder="What you specialise in, how you work, what customers can expect." multiline maxLength={600} helper={`${form.bio.length}/600`} testID="fixa-join-bio" />

          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.textTertiary} />
            <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
              Your phone number is shown to customers once you're verified. AMASS Admin may call to confirm your details.
            </AppText>
          </View>

          <Button label={editing ? "Save changes" : "Send application"} variant="fix" size="lg" iconLeft={editing ? "checkmark" : "paper-plane"} onPress={submit} loading={busy} testID="fixa-join-submit" />
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
