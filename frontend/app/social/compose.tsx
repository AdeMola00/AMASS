/**
 * Social composer — create or edit a post (`?id=` edits). One screen, Nextdoor-simple:
 * photo strip (cover first) → Free / For sale → title + description → category · condition ·
 * who can see it · contact options · pickup note → Post. Photos upload to the public social prefix.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { api, SocialMeta, SocialPostInput, SocialPostKind, SocialScope } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, IconButton, Input, PressableScale, Screen, Sheet, SheetLink, Skeleton, Toggle, useCelebrate, useToast } from "@/src/ui";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";
import { photoUrl, socialFont } from "@/src/components/social/socialTheme";

const MAX_PHOTOS = 6;

export default function SocialComposeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();

  const [meta, setMeta] = useState<SocialMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [kind, setKind] = useState<SocialPostKind>("give");
  const [price, setPrice] = useState("");
  const [negotiable, setNegotiable] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [condition, setCondition] = useState("good");
  const [visibility, setVisibility] = useState<SocialScope>("area");
  const [contactChat, setContactChat] = useState(true);
  const [contactWhatsapp, setContactWhatsapp] = useState(false);
  const [contactPhone, setContactPhone] = useState(false);
  const [pickupNote, setPickupNote] = useState("");
  const [crossList, setCrossList] = useState(false);
  const [sheet, setSheet] = useState<"category" | "condition" | "visibility" | "photo" | null>(null);
  const [photoIdx, setPhotoIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.socialMeta();
        setMeta(m);
        if (editing) {
          const p = await api.socialPost(id!);
          if (!p.is_mine) {
            toast.error("Only the poster can edit this");
            router.back();
            return;
          }
          setPhotos(p.photos);
          setKind(p.kind);
          setPrice(p.price ? String(p.price) : "");
          setNegotiable(p.negotiable);
          setTitle(p.title);
          setBody(p.body);
          setCategory(p.category);
          setCondition(p.condition);
          setVisibility(p.visibility);
          setContactChat(p.contact.chat);
          setContactWhatsapp(p.contact.whatsapp);
          setContactPhone(p.contact.phone);
          setPickupNote(p.pickup_note ?? "");
          setCrossList(!!p.market_item_id);
        } else {
          setVisibility(m.defaults.visibility);
        }
      } catch (e: any) {
        toast.error("Couldn't open the composer", e?.message ?? "Try again");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const priceNum = Number(price.replace(/[^\d]/g, "")) || 0;
  const titleOk = title.trim().length >= 3;
  const priceOk = kind === "give" || priceNum > 0;
  const canPost = titleOk && priceOk && !!category && !uploading && !submitting;
  const catLabel = meta?.categories.find((c) => c.key === category)?.label;
  const condLabel = meta?.conditions.find((c) => c.key === condition)?.label ?? "Good";
  const scopeLabel = useMemo(() => {
    if (!meta) return "";
    if (visibility === "estate") return meta.scopes.estates[0]?.name ?? "Your estate";
    if (visibility === "area") return meta.scopes.areas[0] ?? meta.scopes.city;
    return meta.scopes.city;
  }, [meta, visibility]);

  const addPhotos = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - photos.length, quality: 0.6, base64: true });
      if (res.canceled || !res.assets.length) return;
      const assets = res.assets.slice(0, MAX_PHOTOS - photos.length);
      setUploading({ done: 0, total: assets.length });
      const urls: string[] = [];
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        const dataUrl = a.base64 ? `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` : a.uri;
        const up = await api.socialUpload(dataUrl);
        urls.push(up.url);
        setUploading({ done: i + 1, total: assets.length });
      }
      setPhotos((prev) => [...prev, ...urls].slice(0, MAX_PHOTOS));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't add photos", e?.message ?? "Try again");
    } finally {
      setUploading(null);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") return addPhotos();
    try {
      const perm = await ImagePicker.getCameraPermissionsAsync();
      if (perm.status !== "granted") {
        if (!perm.canAskAgain) {
          toast.info("Camera is off for AMASS", "Allow it in Settings to take photos — you can still add from your library.");
          return;
        }
        const ask = await ImagePicker.requestCameraPermissionsAsync();
        if (ask.status !== "granted") return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      setUploading({ done: 0, total: 1 });
      const up = await api.socialUpload(a.base64 ? `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` : a.uri);
      setPhotos((prev) => [...prev, up.url].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      toast.error("Couldn't take a photo", e?.message ?? "Try again");
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    setTouched(true);
    if (!canPost || !category) return;
    setSubmitting(true);
    const payload: SocialPostInput = {
      title: title.trim(), body: body.trim(), kind, price: kind === "sell" ? priceNum : null, negotiable: kind === "sell" ? negotiable : false,
      category, condition, photos, visibility, estate_id: meta?.defaults.estate_id ?? null, pickup_note: pickupNote.trim() || null,
      contact_chat: contactChat || !(contactWhatsapp || contactPhone), contact_whatsapp: contactWhatsapp, contact_phone: contactPhone, cross_list_market: kind === "sell" && crossList,
    };
    try {
      const r = editing ? await api.socialEditPost(id!, payload) : await api.socialCreatePost(payload);
      track(editing ? "social_post_edited" : "social_post_created", { kind, category, photos: photos.length, visibility });
      socialFeedSignal.markDirty();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!editing) celebrate({ title: kind === "give" ? "Shared 🎁" : "It's live!", icon: kind === "give" ? "gift" : "pricetag", tone: "brand" });
      const alerted = !editing ? Number(("alerted" in r ? r.alerted : 0) ?? 0) : 0;
      toast.success(editing ? "Post updated" : kind === "give" ? "Shared with your neighbours 🎁" : "Your item is live", editing ? undefined : alerted > 0 ? `${alerted} neighbour${alerted === 1 ? "" : "s"} following ${meta?.categories.find((c) => c.key === category)?.label ?? "this category"} got a nudge · ${scopeLabel}` : `Visible to ${scopeLabel}`);
      // Edit: pop back to the detail screen underneath (it refetches via the signal). Create: swap the composer for the new post.
      if (editing && router.canGoBack()) router.back();
      else router.replace(`/social/post/${r.post.id}` as any);
    } catch (e: any) {
      toast.error(editing ? "Couldn't save changes" : "Couldn't publish", e?.message ?? "Check the details and try again");
    } finally {
      setSubmitting(false);
    }
  };

  const hasPhone = !!meta?.defaults.has_phone;

  return (
    <Screen testID="social-compose-screen">
      <View style={styles.header}>
        <IconButton icon="close" label="Cancel" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates?tab=nearby" as any))} testID="social-compose-cancel" />
        <AppText style={styles.headerTitle}>{editing ? "Edit post" : "Share an item"}</AppText>
        <Button label={editing ? "Save" : "Post"} variant="brand" size="sm" disabled={!canPost} loading={submitting} onPress={submit} testID="social-compose-submit" />
      </View>

      {loading ? (
        <View style={{ padding: space[4], gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Skeleton width={120} height={120} radius={radii.lg} />
            <Skeleton width={120} height={120} radius={radii.lg} />
          </View>
          <Skeleton height={48} radius={radii.md} />
          <Skeleton height={56} radius={radii.md} />
          <Skeleton height={96} radius={radii.md} />
        </View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 140 + insets.bottom, gap: 18 }} keyboardShouldPersistTaps="handled" bottomOffset={60} showsVerticalScrollIndicator={false}>
          {/* Photos */}
          <View style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {photos.map((u, i) => (
                <Pressable key={u + i} onPress={() => { setPhotoIdx(i); setSheet("photo"); }} style={[styles.photo, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}${i === 0 ? ", cover" : ""}. Options`} testID={`social-compose-photo-${i}`}>
                  <Image source={{ uri: photoUrl(u) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                  {i === 0 ? (
                    <View style={styles.coverTag}>
                      <AppText variant="micro" color="#FFFFFF" style={{ fontFamily: socialFont.bold }}>
                        Cover
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <PressableScale onPress={addPhotos} disabled={!!uploading} style={[styles.photo, styles.addPhoto, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]} accessibilityRole="button" accessibilityLabel="Add photos" testID="social-compose-add-photos">
                  {uploading ? (
                    <>
                      <Ionicons name="cloud-upload-outline" size={26} color={colors.brand} />
                      <AppText variant="micro" color={colors.brandText} style={{ fontFamily: socialFont.semibold }}>
                        Uploading {uploading.done}/{uploading.total}
                      </AppText>
                    </>
                  ) : (
                    <>
                      <Ionicons name="images-outline" size={26} color={colors.brand} />
                      <AppText variant="caption" color={colors.brandText} style={{ fontFamily: socialFont.bold }}>
                        Add photos
                      </AppText>
                    </>
                  )}
                </PressableScale>
              ) : null}
              {photos.length < MAX_PHOTOS && Platform.OS !== "web" ? (
                <PressableScale onPress={takePhoto} disabled={!!uploading} style={[styles.photo, styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Take a photo" testID="social-compose-camera">
                  <Ionicons name="camera-outline" size={26} color={colors.text} />
                  <AppText variant="caption" style={{ fontFamily: socialFont.semibold }}>
                    Camera
                  </AppText>
                </PressableScale>
              ) : null}
            </ScrollView>
            <AppText variant="caption" tone="tertiary">
              Add up to {MAX_PHOTOS} photos. Tap a photo to make it the cover or remove it. Clear, well-lit photos get picked up faster.
            </AppText>
          </View>

          {/* Free / For sale */}
          <View style={{ gap: 10 }}>
            <AppText style={styles.q}>Free, or for sale?</AppText>
            <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="radiogroup">
              {(["give", "sell"] as SocialPostKind[]).map((k) => {
                const active = kind === k;
                return (
                  <Pressable key={k} onPress={() => setKind(k)} style={[styles.segmentItem, active && { backgroundColor: colors.brand }]} accessibilityRole="radio" accessibilityState={{ selected: active }} testID={`social-compose-kind-${k}`}>
                    <Ionicons name={k === "give" ? "gift" : "pricetag"} size={16} color={active ? colors.onBrand : colors.text} />
                    <AppText variant="caption" color={active ? colors.onBrand : colors.text} style={{ fontFamily: socialFont.bold }}>
                      {k === "give" ? "Free" : "For sale"}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {kind === "sell" ? (
              <View style={{ gap: 8 }}>
                <Input value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ""))} placeholder="Price in Naira, e.g. 25000" keyboardType="number-pad" iconLeft="cash-outline" error={touched && !priceOk ? "Add a price, or switch to Free" : undefined} containerStyle={{ marginBottom: 0 }} testID="social-compose-price" />
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium">Open to offers</AppText>
                    <AppText variant="caption" tone="tertiary">
                      Shows “Negotiable” next to the price
                    </AppText>
                  </View>
                  <Toggle value={negotiable} onChange={setNegotiable} label="Open to offers" testID="social-compose-negotiable" />
                </View>
              </View>
            ) : (
              <View style={[styles.hint, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="leaf" size={16} color={colors.brand} />
                <AppText variant="caption" color={colors.brandText} style={{ flex: 1 }}>
                  Free items get a FREE tag and reach neighbours first. Thank you for keeping it out of landfill.
                </AppText>
              </View>
            )}
          </View>

          {/* Title + description */}
          <View style={{ gap: 10 }}>
            <AppText style={styles.q}>What are you sharing?</AppText>
            <Input value={title} onChangeText={setTitle} placeholder="e.g. 3-seater sofa, barely used" maxLength={80} size="lg" error={touched && !titleOk ? "Give it a short title (3+ characters)" : undefined} containerStyle={{ marginBottom: 0 }} testID="social-compose-title" />
            <Input value={body} onChangeText={setBody} placeholder="Describe it — size, age, any marks, why you're letting it go…" multiline maxLength={1000} containerStyle={{ marginBottom: 0 }} testID="social-compose-body" />
          </View>

          {/* Details rows */}
          <View style={[styles.rows, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]}>
            <DetailRow icon="grid-outline" label="Category" value={catLabel ?? "Select"} missing={touched && !category} onPress={() => setSheet("category")} testID="social-compose-category" />
            <DetailRow icon="sparkles-outline" label="Condition" value={condLabel} onPress={() => setSheet("condition")} testID="social-compose-condition" />
            <DetailRow icon={visibility === "estate" ? "home-outline" : visibility === "area" ? "navigate-outline" : "business-outline"} label="Who can see it" value={scopeLabel} onPress={() => setSheet("visibility")} last testID="social-compose-visibility" />
          </View>

          {/* Contact & privacy */}
          <View style={{ gap: 10 }}>
            <AppText style={styles.q}>How can neighbours reach you?</AppText>
            <View style={[styles.rows, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]}>
              <View style={[styles.toggleRow, styles.rowPad, { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">Message in AMASS</AppText>
                  <AppText variant="caption" tone="tertiary">
                    Private chat · recommended
                  </AppText>
                </View>
                <Toggle value={contactChat || !(contactWhatsapp || contactPhone)} onChange={(v) => setContactChat(v || !(contactWhatsapp || contactPhone))} label="Message in AMASS" testID="social-compose-contact-chat" />
              </View>
              <View style={[styles.toggleRow, styles.rowPad, { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">WhatsApp</AppText>
                  <AppText variant="caption" tone="tertiary">
                    {hasPhone ? "Your number is only revealed when someone taps WhatsApp" : "Add a phone number in Profile to enable"}
                  </AppText>
                </View>
                <Toggle value={contactWhatsapp} onChange={setContactWhatsapp} label="WhatsApp" disabled={!hasPhone} testID="social-compose-contact-whatsapp" />
              </View>
              <View style={[styles.toggleRow, styles.rowPad]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">Phone call</AppText>
                  <AppText variant="caption" tone="tertiary">
                    {hasPhone ? "Same — revealed only on tap" : "Add a phone number in Profile to enable"}
                  </AppText>
                </View>
                <Toggle value={contactPhone} onChange={setContactPhone} label="Phone call" disabled={!hasPhone} testID="social-compose-contact-phone" />
              </View>
            </View>
            <Input value={pickupNote} onChangeText={setPickupNote} placeholder="Pickup note (optional), e.g. weekends only, estate gate" maxLength={120} iconLeft="location-outline" containerStyle={{ marginBottom: 0 }} testID="social-compose-pickup" />
            <View style={[styles.hint, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand} />
              <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                Neighbours see “{scopeLabel}” — never your address. Nobody is contacted on your behalf; people reach out only if they choose to.
              </AppText>
            </View>
          </View>

          {kind === "sell" ? (
            <View style={[styles.toggleRow, styles.rows, styles.rowPad, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]}>
              <View style={[styles.marketIcon, { backgroundColor: colors.premiumSoft }]}>
                <Ionicons name="cube-outline" size={18} color={colors.premium} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium">Also list in the Declutter market</AppText>
                <AppText variant="caption" tone="tertiary">
                  Reaches buyers across Lagos, with offers and in-app chat
                </AppText>
              </View>
              <Toggle value={crossList} onChange={setCrossList} label="Also list in the Declutter market" testID="social-compose-crosslist" />
            </View>
          ) : null}

          <Button label={editing ? "Save changes" : kind === "give" ? "Share for free" : "Post for sale"} variant="brand" size="lg" fullWidth iconLeft={kind === "give" ? "gift" : "pricetag"} disabled={!canPost} loading={submitting} onPress={submit} testID="social-compose-submit-bottom" />
          {touched && !canPost ? (
            <AppText variant="caption" color={colors.error} align="center">
              {!titleOk ? "Add a title" : !category ? "Pick a category" : !priceOk ? "Add a price or choose Free" : uploading ? "Wait for photos to finish uploading" : ""}
            </AppText>
          ) : null}
        </KeyboardAwareScrollView>
      )}

      {/* Category sheet */}
      <Sheet visible={sheet === "category"} onClose={() => setSheet(null)} title="Category" testID="social-category-sheet">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(meta?.categories ?? []).map((c) => {
            const active = category === c.key;
            return (
              <Pressable key={c.key} onPress={() => { setCategory(c.key); setSheet(null); }} style={[styles.catChip, { backgroundColor: active ? colors.brand : colors.surfaceAlt }]} accessibilityRole="radio" accessibilityState={{ selected: active }} testID={`social-category-${c.key}`}>
                <Ionicons name={c.icon as any} size={16} color={active ? colors.onBrand : c.color} />
                <AppText variant="caption" color={active ? colors.onBrand : colors.text} style={{ fontFamily: socialFont.semibold }}>
                  {c.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* Condition sheet */}
      <Sheet visible={sheet === "condition"} onClose={() => setSheet(null)} title="Condition" testID="social-condition-sheet">
        <View style={{ gap: 6 }}>
          {(meta?.conditions ?? []).map((c) => {
            const active = condition === c.key;
            return (
              <Pressable key={c.key} onPress={() => { setCondition(c.key); setSheet(null); }} style={[styles.optionRow, { backgroundColor: active ? colors.brandSoft : colors.surfaceAlt }]} accessibilityRole="radio" accessibilityState={{ selected: active }} testID={`social-condition-${c.key}`}>
                <AppText variant="bodyMedium" style={{ flex: 1 }}>
                  {c.label}
                </AppText>
                <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={20} color={active ? colors.brand : colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* Visibility sheet */}
      <Sheet visible={sheet === "visibility"} onClose={() => setSheet(null)} title="Who can see this post" testID="social-visibility-sheet">
        <View style={{ gap: 6 }}>
          {([
            { key: "estate" as SocialScope, label: meta?.scopes.estates[0]?.name ?? "Your estate", caption: meta?.scopes.estates.length ? "Only approved residents of your estate" : "Join your estate in Neighbours to unlock", icon: "home", disabled: !meta?.scopes.estates.length },
            { key: "area" as SocialScope, label: meta?.scopes.areas[0] ?? "Your area", caption: meta?.scopes.areas.length ? "Your estate and nearby streets" : "Set by your estate — join one in Neighbours", icon: "navigate", disabled: !meta?.scopes.areas.length },
            { key: "city" as SocialScope, label: meta?.scopes.city ?? "City", caption: "Everyone in the city — widest reach", icon: "business", disabled: false },
          ]).map((o) => {
            const active = visibility === o.key;
            return (
              <Pressable key={o.key} disabled={o.disabled} onPress={() => { setVisibility(o.key); setSheet(null); }} style={[styles.optionRow, { backgroundColor: active ? colors.brandSoft : colors.surfaceAlt, opacity: o.disabled ? 0.55 : 1 }]} accessibilityRole="radio" accessibilityState={{ selected: active, disabled: o.disabled }} testID={`social-visibility-${o.key}`}>
                <Ionicons name={o.icon as any} size={18} color={active ? colors.brand : colors.text} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">{o.label}</AppText>
                  <AppText variant="caption" tone="tertiary">
                    {o.caption}
                  </AppText>
                </View>
                <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={20} color={active ? colors.brand : colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
        {!meta?.scopes.estates.length ? <SheetLink label="join your estate in Neighbours" onPress={() => { setSheet(null); router.push("/neighbours/estates" as any); }} testID="social-visibility-join" /> : null}
      </Sheet>

      {/* Photo options */}
      <Sheet visible={sheet === "photo"} onClose={() => setSheet(null)} title="Photo" testID="social-photo-sheet">
        <View style={{ gap: 8 }}>
          {photoIdx !== null && photoIdx > 0 ? <Button label="Make this the cover" variant="secondary" size="lg" fullWidth iconLeft="star-outline" onPress={() => { setPhotos((p) => { const n = [...p]; const [x] = n.splice(photoIdx, 1); return [x, ...n]; }); setSheet(null); }} testID="social-photo-cover" /> : null}
          <Button label="Remove photo" variant="destructive" size="lg" fullWidth iconLeft="trash-outline" onPress={() => { setPhotos((p) => p.filter((_, i) => i !== photoIdx)); setSheet(null); }} testID="social-photo-remove" />
        </View>
        <SheetLink label="cancel" onPress={() => setSheet(null)} />
      </Sheet>
    </Screen>
  );
}

function DetailRow({ icon, label, value, onPress, missing, last, testID }: { icon: any; label: string; value: string; onPress: () => void; missing?: boolean; last?: boolean; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.detailRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <Ionicons name={icon} size={20} color={missing ? colors.error : colors.text} />
      <AppText variant="bodyMedium" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="bodySm" color={missing ? colors.error : colors.textSecondary} numberOfLines={1} style={{ maxWidth: "50%" }}>
        {value}
      </AppText>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 6 },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: socialFont.bold, fontSize: 19, lineHeight: 24 },
  photo: { width: 120, height: 120, borderRadius: radii.lg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  addPhoto: { borderWidth: 1.5, borderStyle: "dashed", gap: 6 },
  coverTag: { position: "absolute", left: 8, bottom: 8, backgroundColor: "rgba(17,17,17,0.7)", paddingHorizontal: 8, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  q: { fontFamily: socialFont.black, fontSize: 22, lineHeight: 27, letterSpacing: -0.5 },
  segment: { flexDirection: "row", padding: 4, borderRadius: radii.pill, gap: 4 },
  segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: radii.pill },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowPad: { padding: 14 },
  hint: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  rows: { borderRadius: radii.lg, borderWidth: 1, overflow: "hidden" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, minHeight: 56 },
  marketIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radii.pill },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md },
});
