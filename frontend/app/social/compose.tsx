/**
 * Feed composer — create or edit any post type (`?type=` preselects, `?id=` edits).
 *   type chips → what's on your mind (with @mention suggestions) → photos (≤10) + one short video →
 *   type fields (price · category · condition · delivery | service · from-price · coverage | listing |
 *   business · offer · link) → tag products → who can see it · place · contact → Post.
 * Photos go to the public social prefix; videos use the chunked uploader. Every post is AI-screened after publish.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { feedApi, mediaUrl, naira, type FeedAuthor, type FeedMeta, type FeedPostInput, type FeedPostType, type FeedProperty, type FeedVideo } from "@/src/lib/feedApi";
import { uploadVideoChunked } from "@/src/utils/upload";
import { useTheme } from "@/src/theme";
import { boldFont, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Button, IconButton, Input, PressableScale, Screen, Sheet, SheetLink, Skeleton, Toggle, useCelebrate, useToast, type IconName } from "@/src/ui";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";

const MAX_PHOTOS = 10;
type Vis = FeedPostInput["visibility"];

export default function FeedComposeScreen() {
  const { id, type: typeParam } = useLocalSearchParams<{ id?: string; type?: string }>();
  const editing = !!id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();

  const [meta, setMeta] = useState<FeedMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<FeedPostType>((["general", "sale", "free", "service", "property", "promo"].includes(typeParam ?? "") ? typeParam : "general") as FeedPostType);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [video, setVideo] = useState<FeedVideo | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [negotiable, setNegotiable] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [condition, setCondition] = useState("good");
  const [delivery, setDelivery] = useState<"pickup" | "delivery" | "both">("pickup");
  const [serviceCategory, setServiceCategory] = useState<string | null>(null);
  const [startingPrice, setStartingPrice] = useState("");
  const [coverage, setCoverage] = useState("");
  const [property, setProperty] = useState<FeedProperty | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [offer, setOffer] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [taggedProducts, setTaggedProducts] = useState<{ id: string; name: string; image?: string | null; brand?: string | null }[]>([]);
  const [visibility, setVisibility] = useState<Vis>("city");
  const [locationLabel, setLocationLabel] = useState("");
  const [contactChat, setContactChat] = useState(true);
  const [contactWhatsapp, setContactWhatsapp] = useState(false);
  const [contactPhone, setContactPhone] = useState(false);
  const [sheet, setSheet] = useState<"category" | "condition" | "delivery" | "service" | "property" | "products" | "visibility" | "photo" | null>(null);
  const [photoIdx, setPhotoIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [mentionHits, setMentionHits] = useState<FeedAuthor[]>([]);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerItems, setPickerItems] = useState<any[]>([]);
  const bodyRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await feedApi.meta();
        setMeta(m);
        setVisibility((m.defaults.visibility as Vis) ?? "city");
        if (editing) {
          const p = await feedApi.post(id!);
          if (!p.is_mine) {
            toast.error("Only the poster can edit this");
            router.back();
            return;
          }
          setType(p.type);
          setBody(p.body);
          setTitle(p.title ?? "");
          setPhotos(p.photos);
          setVideo(p.videos[0] ?? null);
          setPrice(p.price ? String(p.price) : "");
          setNegotiable(p.negotiable);
          setCategory(p.category ?? null);
          setCondition(p.condition ?? "good");
          setDelivery((p.delivery as any) ?? "pickup");
          setServiceCategory(p.service?.category ?? null);
          setStartingPrice(p.service?.starting_price ? String(p.service.starting_price) : "");
          setCoverage(p.service?.coverage ?? "");
          setProperty(p.property ?? null);
          setBusinessName(p.promo?.business_name ?? "");
          setOffer(p.promo?.offer ?? "");
          setLinkUrl(p.promo?.link_url ?? "");
          setVisibility(p.visibility as Vis);
          setLocationLabel(p.location_label ?? "");
          setContactChat(p.contact.chat);
          setContactWhatsapp(p.contact.whatsapp);
          setContactPhone(p.contact.phone);
        }
      } catch (e: any) {
        toast.error("Couldn't open the composer", e?.message ?? "Try again");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // @mention suggestions for the word being typed.
  useEffect(() => {
    const m = body.match(/(?:^|\s)@([A-Za-z0-9_.]{1,30})$/);
    if (!m) return setMentionHits([]);
    const t = setTimeout(() => feedApi.mentionSearch(m[1]).then((r) => setMentionHits(r.items.slice(0, 6))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [body]);
  const insertMention = (u: FeedAuthor & { handle?: string | null }) => {
    const handle = u.handle || u.full_name.replace(/\s+/g, "").toLowerCase();
    setBody((b) => b.replace(/@([A-Za-z0-9_.]{1,30})$/, `@${handle} `));
    setMentionHits([]);
    bodyRef.current?.focus();
  };

  // Property / product pickers
  useEffect(() => {
    if (sheet !== "property" && sheet !== "products") return;
    const t = setTimeout(() => (sheet === "property" ? feedApi.tagProperties(pickerQ) : feedApi.tagProducts(pickerQ)).then((r) => setPickerItems(r.items)).catch(() => setPickerItems([])), 200);
    return () => clearTimeout(t);
  }, [sheet, pickerQ]);

  const priceNum = Number(price.replace(/[^\d]/g, "")) || 0;
  const isItem = type === "sale" || type === "free";
  const textOk = body.trim().length > 0 || title.trim().length > 0 || photos.length > 0 || !!video;
  const titleOk = !isItem || title.trim().length >= 3;
  const priceOk = type !== "sale" || priceNum > 0;
  const categoryOk = !isItem || !!category;
  const serviceOk = type !== "service" || !!serviceCategory;
  const propertyOk = type !== "property" || !!property;
  const promoOk = type !== "promo" || businessName.trim().length >= 2;
  const canPost = textOk && titleOk && priceOk && categoryOk && serviceOk && propertyOk && promoOk && !uploading && videoProgress === null && !submitting;
  const typeMeta = meta?.post_types.find((t) => t.key === type);
  const hasPhone = !!meta?.defaults.has_phone;
  const visLabel = useMemo(() => {
    if (!meta) return "";
    if (visibility === "estate") return meta.scopes.estates[0]?.name ?? "Your estate";
    if (visibility === "area") return meta.scopes.areas[0] ?? meta.scopes.city;
    if (visibility === "everyone") return "Everyone on AMASS";
    return meta.scopes.city;
  }, [meta, visibility]);

  const toDataUrl = async (a: ImagePicker.ImagePickerAsset) => {
    const mime = a.mimeType || "image/jpeg";
    if (a.base64) return `data:${mime};base64,${a.base64}`;
    if (a.uri.startsWith("data:")) return a.uri;
    if (Platform.OS === "web") return a.uri;
    return `data:${mime};base64,${await new File(a.uri).base64()}`;
  };
  const addPhotos = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - photos.length, quality: 0.6, base64: true });
      if (res.canceled || !res.assets.length) return;
      const assets = res.assets.slice(0, MAX_PHOTOS - photos.length);
      setUploading({ done: 0, total: assets.length });
      const urls: string[] = [];
      for (let i = 0; i < assets.length; i++) {
        const up = await feedApi.upload(await toDataUrl(assets[i]));
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
      let perm = await ImagePicker.getCameraPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) return toast.show({ kind: "info", title: "Camera is off for AMASS", body: "Allow it in Settings to take photos — you can still add from your library.", actionLabel: "Open Settings", onAction: () => import("react-native").then((rn) => rn.Linking.openSettings()) });
        perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
      if (res.canceled || !res.assets[0]) return;
      setUploading({ done: 0, total: 1 });
      const up = await feedApi.upload(await toDataUrl(res.assets[0]));
      setPhotos((prev) => [...prev, up.url].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      toast.error("Couldn't take a photo", e?.message ?? "Try again");
    } finally {
      setUploading(null);
    }
  };
  const addVideo = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: false, quality: 0.8, videoMaxDuration: 90 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.duration && a.duration > 95_000) return toast.error("Keep videos under 90 seconds", "Trim it and try again.");
      setVideoProgress(0);
      const out = await uploadVideoChunked(a.uri, { mime: a.mimeType || "video/mp4", filename: a.fileName || "feed.mp4", onProgress: setVideoProgress });
      setVideo({ url: out.url, thumb: null, duration: a.duration ? Math.round(a.duration / 1000) : null });
      toast.success("Video added", `${Math.max(1, Math.round(out.bytes / 1024 / 1024))} MB · ready to post`);
    } catch (e: any) {
      toast.error("Couldn't upload the video", e?.message ?? "Try a shorter clip.");
    } finally {
      setVideoProgress(null);
    }
  };

  const submit = async () => {
    setTouched(true);
    if (!canPost) return;
    setSubmitting(true);
    const payload: FeedPostInput = {
      type, title: title.trim() || null, body: body.trim(), photos, videos: video ? [video] : [],
      price: type === "sale" ? priceNum : null, negotiable: type === "sale" ? negotiable : false,
      category: isItem ? category : null, condition: isItem ? condition : null, delivery: isItem ? delivery : null,
      service_category: type === "service" ? serviceCategory : null, starting_price: type === "service" ? Number(startingPrice.replace(/[^\d]/g, "")) || null : null, coverage: type === "service" ? coverage.trim() || null : null,
      property_id: type === "property" ? property?.id ?? null : null,
      business_name: type === "promo" ? businessName.trim() : null, offer: type === "promo" ? offer.trim() || null : null, link_url: type === "promo" ? linkUrl.trim() || null : null,
      visibility, estate_id: meta?.defaults.estate_id ?? null, location_label: locationLabel.trim() || null,
      contact_chat: contactChat || !(contactWhatsapp || contactPhone), contact_whatsapp: contactWhatsapp, contact_phone: contactPhone,
      tagged_products: taggedProducts.map((p) => p.id), tagged_brands: [],
    };
    try {
      if (editing) await feedApi.editPost(id!, payload);
      else await feedApi.createPost(payload);
      socialFeedSignal.markDirty();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!editing) celebrate({ title: type === "free" ? "Shared 🎁" : type === "sale" ? "It's live!" : "Posted!", icon: (typeMeta?.icon as any) ?? "sparkles", tone: "brand" });
      toast.success(editing ? "Post updated" : "Your post is live", editing ? undefined : `Visible to ${visLabel} · checked by AMASS safety AI`);
      if (editing && router.canGoBack()) router.back();
      else router.replace("/(tabs)/updates" as any); // back to the Feed — the new post sits at the top
    } catch (e: any) {
      toast.error(editing ? "Couldn't save changes" : "Couldn't publish", e?.message ?? "Check the details and try again");
    } finally {
      setSubmitting(false);
    }
  };

  const problem = !textOk ? "Write something or add a photo" : !titleOk ? "Give the item a title" : !categoryOk ? "Pick a category" : !priceOk ? "Add a price or post it as Free" : !serviceOk ? "Choose the service you offer" : !propertyOk ? "Pick the listing to showcase" : !promoOk ? "Add your business name" : uploading || videoProgress !== null ? "Wait for uploads to finish" : "";

  return (
    <Screen testID="feed-compose-screen">
      <View style={styles.header}>
        <IconButton icon="close" label="Cancel" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates" as any))} testID="feed-compose-cancel" />
        <AppText style={styles.headerTitle}>{editing ? "Edit post" : typeMeta ? `New ${typeMeta.label.toLowerCase()}` : "New post"}</AppText>
        <Button label={editing ? "Save" : "Post"} variant="brand" size="sm" disabled={!canPost} loading={submitting} onPress={submit} testID="feed-compose-submit" />
      </View>

      {loading ? (
        <View style={{ padding: space[4], gap: 14 }}>
          <Skeleton height={44} radius={radii.pill} />
          <Skeleton height={120} radius={radii.lg} />
          <Skeleton height={56} radius={radii.md} />
        </View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 140 + insets.bottom, gap: 18 }} keyboardShouldPersistTaps="handled" bottomOffset={60} showsVerticalScrollIndicator={false}>
          {/* Type */}
          {!editing ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} testID="feed-compose-types">
              {(meta?.post_types ?? []).map((t) => {
                const active = type === t.key;
                return (
                  <Pressable key={t.key} onPress={() => setType(t.key)} style={[styles.typeChip, { backgroundColor: active ? t.color : colors.surfaceAlt }]} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={t.label} testID={`feed-compose-type-${t.key}`}>
                    <Ionicons name={t.icon as IconName} size={15} color={active ? "#fff" : colors.text} />
                    <AppText variant="caption" color={active ? "#fff" : colors.text} style={{ fontFamily: boldFont.bold }}>
                      {t.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {typeMeta ? (
            <AppText variant="caption" tone="tertiary" style={{ marginTop: -8 }}>
              {typeMeta.hint}
            </AppText>
          ) : null}

          {/* Text */}
          <View style={[styles.textCard, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]}>
            {isItem || type === "service" || type === "promo" || type === "property" ? <TextInput value={title} onChangeText={setTitle} placeholder={isItem ? "What are you selling? e.g. 3-seater sofa, barely used" : type === "service" ? "Headline, e.g. Same-day AC servicing in Lekki" : type === "promo" ? "Headline, e.g. 20% off this weekend" : "Headline (optional)"} placeholderTextColor={colors.textTertiary} maxLength={90} style={[styles.titleInput, { color: colors.text, borderBottomColor: colors.divider }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]} accessibilityLabel="Title" testID="feed-compose-title" /> : null}
            <TextInput ref={bodyRef} value={body} onChangeText={setBody} placeholder={type === "general" ? "What's happening around you? Tag people with @ and topics with #" : "Describe it — details, condition, what makes it great…"} placeholderTextColor={colors.textTertiary} multiline maxLength={2200} style={[styles.bodyInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]} accessibilityLabel="Post text" testID="feed-compose-body" />
            {mentionHits.length ? (
              <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }} testID="feed-compose-mentions">
                {mentionHits.map((u) => (
                  <Pressable key={u.id} onPress={() => insertMention(u)} style={[styles.mention, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={`Mention ${u.full_name}`} testID={`feed-compose-mention-${u.id}`}>
                    <Avatar name={u.full_name} uri={u.avatar_url} size={22} />
                    <AppText variant="caption" style={{ fontFamily: boldFont.semibold }} numberOfLines={1}>
                      {u.full_name}
                    </AppText>
                    {u.handle ? (
                      <AppText variant="micro" tone="tertiary">
                        @{u.handle}
                      </AppText>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <AppText variant="micro" tone="tertiary" align="right" style={{ marginTop: 6 }}>
              {body.length}/2200
            </AppText>
          </View>

          {/* Media */}
          <View style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {video ? (
                <View style={[styles.photo, { backgroundColor: colors.surfaceInverse }]} testID="feed-compose-video">
                  <Ionicons name="videocam" size={30} color="#fff" />
                  <AppText variant="micro" color="#fff" style={{ fontFamily: boldFont.semibold, marginTop: 4 }}>
                    Video{video.duration ? ` · ${video.duration}s` : ""}
                  </AppText>
                  <Pressable onPress={() => setVideo(null)} hitSlop={8} style={styles.removeX} accessibilityRole="button" accessibilityLabel="Remove video" testID="feed-compose-video-remove">
                    <Ionicons name="close" size={14} color="#111" />
                  </Pressable>
                </View>
              ) : null}
              {photos.map((u, i) => (
                <Pressable key={u + i} onPress={() => { setPhotoIdx(i); setSheet("photo"); }} style={[styles.photo, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}${i === 0 ? ", cover" : ""}. Options`} testID={`feed-compose-photo-${i}`}>
                  <Image source={{ uri: mediaUrl(u) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                  {i === 0 ? (
                    <View style={styles.coverTag}>
                      <AppText variant="micro" color="#FFFFFF" style={{ fontFamily: boldFont.bold }}>
                        Cover
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <PressableScale onPress={addPhotos} disabled={!!uploading} style={[styles.photo, styles.addPhoto, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]} accessibilityRole="button" accessibilityLabel="Add photos" testID="feed-compose-add-photos">
                  <Ionicons name={uploading ? "cloud-upload-outline" : "images-outline"} size={26} color={colors.brand} />
                  <AppText variant="caption" color={colors.brandText} style={{ fontFamily: boldFont.bold }}>
                    {uploading ? `${uploading.done}/${uploading.total}` : "Photos"}
                  </AppText>
                </PressableScale>
              ) : null}
              {!video ? (
                <PressableScale onPress={addVideo} disabled={videoProgress !== null} style={[styles.photo, styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Add a short video" testID="feed-compose-add-video">
                  <Ionicons name="videocam-outline" size={26} color={colors.text} />
                  <AppText variant="caption" style={{ fontFamily: boldFont.semibold }}>
                    {videoProgress !== null ? `${Math.round(videoProgress * 100)}%` : "Video"}
                  </AppText>
                </PressableScale>
              ) : null}
              {photos.length < MAX_PHOTOS && Platform.OS !== "web" ? (
                <PressableScale onPress={takePhoto} disabled={!!uploading} style={[styles.photo, styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Take a photo" testID="feed-compose-camera">
                  <Ionicons name="camera-outline" size={26} color={colors.text} />
                  <AppText variant="caption" style={{ fontFamily: boldFont.semibold }}>
                    Camera
                  </AppText>
                </PressableScale>
              ) : null}
            </ScrollView>
            <AppText variant="caption" tone="tertiary">
              Up to {MAX_PHOTOS} photos and one video (≤ 90 s). Tap a photo to make it the cover or remove it.
            </AppText>
          </View>

          {/* Type fields */}
          {isItem ? (
            <View style={{ gap: 10 }}>
              {type === "sale" ? (
                <>
                  <Input value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ""))} placeholder="Price in Naira, e.g. 25000" keyboardType="number-pad" iconLeft="cash-outline" error={touched && !priceOk ? "Add a price, or post it as Free" : undefined} containerStyle={{ marginBottom: 0 }} testID="feed-compose-price" />
                  <View style={[styles.toggleRow, styles.rows, styles.rowPad, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyMedium">Open to offers</AppText>
                      <AppText variant="caption" tone="tertiary">
                        Shows “Negotiable” next to the price
                      </AppText>
                    </View>
                    <Toggle value={negotiable} onChange={setNegotiable} label="Open to offers" testID="feed-compose-negotiable" />
                  </View>
                </>
              ) : null}
              <View style={[styles.rows, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]}>
                <DetailRow icon="grid-outline" label="Category" value={meta?.categories.find((c) => c.key === category)?.label ?? "Select"} missing={touched && !category} onPress={() => setSheet("category")} testID="feed-compose-category" />
                <DetailRow icon="sparkles-outline" label="Condition" value={meta?.conditions.find((c) => c.key === condition)?.label ?? "Good"} onPress={() => setSheet("condition")} testID="feed-compose-condition" />
                <DetailRow icon="bicycle-outline" label="Pickup / delivery" value={meta?.delivery.find((d) => d.key === delivery)?.label ?? "Pickup only"} onPress={() => setSheet("delivery")} last testID="feed-compose-delivery" />
              </View>
            </View>
          ) : null}
          {type === "service" ? (
            <View style={[styles.rows, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]}>
              <DetailRow icon="construct-outline" label="Service" value={serviceCategory ?? "Select"} missing={touched && !serviceCategory} onPress={() => setSheet("service")} testID="feed-compose-service" />
              <View style={[styles.rowPad, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
                <Input value={startingPrice} onChangeText={(t) => setStartingPrice(t.replace(/[^\d]/g, ""))} placeholder="Starting price (optional), e.g. 15000" keyboardType="number-pad" iconLeft="cash-outline" containerStyle={{ marginBottom: 0 }} testID="feed-compose-starting-price" />
              </View>
              <View style={styles.rowPad}>
                <Input value={coverage} onChangeText={setCoverage} placeholder="Areas you cover, e.g. Lekki · Ajah · VI" maxLength={120} iconLeft="navigate-outline" containerStyle={{ marginBottom: 0 }} testID="feed-compose-coverage" />
              </View>
            </View>
          ) : null}
          {type === "property" ? (
            <Pressable onPress={() => { setPickerQ(""); setSheet("property"); }} style={[styles.propPick, { backgroundColor: colors.surface, borderColor: touched && !property ? colors.error : colors.border }, !isDark && shadows.xs]} accessibilityRole="button" accessibilityLabel={property ? `Listing: ${property.title}. Change` : "Pick a listing"} testID="feed-compose-property">
              <View style={[styles.propImg, { backgroundColor: colors.infoSoft }]}>{property?.image ? <Image source={{ uri: mediaUrl(property.image) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="home" size={22} color={colors.info} />}</View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {property ? property.title : "Pick the listing to showcase"}
                </AppText>
                <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                  {property ? `${naira(property.price)} · ${property.city ?? ""}` : "Your own listings first, then any live AMASS listing"}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {type === "promo" ? (
            <View style={{ gap: 10 }}>
              <Input value={businessName} onChangeText={setBusinessName} placeholder="Business name" iconLeft="storefront-outline" maxLength={80} error={touched && !promoOk ? "Add your business name" : undefined} containerStyle={{ marginBottom: 0 }} testID="feed-compose-business" />
              <Input value={offer} onChangeText={setOffer} placeholder="The offer, e.g. Free delivery on orders over ₦50k" iconLeft="gift-outline" maxLength={140} containerStyle={{ marginBottom: 0 }} testID="feed-compose-offer" />
              <Input value={linkUrl} onChangeText={setLinkUrl} placeholder="Link (optional) https://…" iconLeft="link-outline" autoCapitalize="none" keyboardType="url" maxLength={400} containerStyle={{ marginBottom: 0 }} testID="feed-compose-link" />
            </View>
          ) : null}

          {/* Tag products */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AppText style={styles.q}>Tag products</AppText>
              <AppText variant="caption" tone="tertiary">
                optional
              </AppText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {taggedProducts.map((p) => (
                <Pressable key={p.id} onPress={() => setTaggedProducts((t) => t.filter((x) => x.id !== p.id))} style={[styles.tagChip, { backgroundColor: colors.marketSoft }]} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} testID={`feed-compose-tag-${p.id}`}>
                  <AppText variant="caption" color={colors.marketText} style={{ fontFamily: boldFont.semibold }} numberOfLines={1}>
                    {p.name}
                  </AppText>
                  <Ionicons name="close" size={14} color={colors.marketText} />
                </Pressable>
              ))}
              {taggedProducts.length < 6 ? (
                <Pressable onPress={() => { setPickerQ(""); setSheet("products"); }} style={[styles.tagChip, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel="Tag a product from a brand" testID="feed-compose-add-product">
                  <Ionicons name="pricetags-outline" size={15} color={colors.text} />
                  <AppText variant="caption" style={{ fontFamily: boldFont.semibold }}>
                    Tag a brand product
                  </AppText>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>

          {/* Audience & contact */}
          <View style={{ gap: 10 }}>
            <AppText style={styles.q}>Who sees it & how they reach you</AppText>
            <View style={[styles.rows, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]}>
              <DetailRow icon={visibility === "estate" ? "home-outline" : visibility === "area" ? "navigate-outline" : visibility === "everyone" ? "globe-outline" : "business-outline"} label="Who can see it" value={visLabel} onPress={() => setSheet("visibility")} testID="feed-compose-visibility" />
              <View style={styles.rowPad}>
                <Input value={locationLabel} onChangeText={setLocationLabel} placeholder="Place label (optional), e.g. Lekki Phase 1" maxLength={80} iconLeft="location-outline" containerStyle={{ marginBottom: 0 }} testID="feed-compose-location" />
              </View>
            </View>
            {type !== "general" ? (
              <View style={[styles.rows, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]}>
                <ToggleLine label="Message in AMASS" caption="Private chat · recommended" value={contactChat || !(contactWhatsapp || contactPhone)} onChange={(v) => setContactChat(v || !(contactWhatsapp || contactPhone))} testID="feed-compose-contact-chat" />
                <ToggleLine label="WhatsApp" caption={hasPhone ? "Number revealed only when someone taps WhatsApp" : "Add a phone number in Profile to enable"} value={contactWhatsapp} onChange={setContactWhatsapp} disabled={!hasPhone} testID="feed-compose-contact-whatsapp" />
                <ToggleLine label="Phone call" caption={hasPhone ? "Same — revealed only on tap" : "Add a phone number in Profile to enable"} value={contactPhone} onChange={setContactPhone} disabled={!hasPhone} last testID="feed-compose-contact-phone" />
              </View>
            ) : null}
            <View style={[styles.hint, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand} />
              <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                Neighbours see “{visLabel}” — never your address. AMASS safety AI reviews every post&apos;s text and photos before it reaches people.
              </AppText>
            </View>
          </View>

          <Button label={editing ? "Save changes" : typeMeta ? `Post ${typeMeta.label.toLowerCase()}` : "Post"} variant="brand" size="lg" fullWidth iconLeft={(typeMeta?.icon as any) ?? "send"} disabled={!canPost} loading={submitting} onPress={submit} testID="feed-compose-submit-bottom" />
          {touched && problem ? (
            <AppText variant="caption" color={colors.error} align="center" testID="feed-compose-problem">
              {problem}
            </AppText>
          ) : null}
        </KeyboardAwareScrollView>
      )}

      {/* Sheets */}
      <Sheet visible={sheet === "category"} onClose={() => setSheet(null)} title="Category" scroll testID="feed-category-sheet">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(meta?.categories ?? []).map((c) => {
            const active = category === c.key;
            return (
              <Pressable key={c.key} onPress={() => { setCategory(c.key); setSheet(null); }} style={[styles.catChip, { backgroundColor: active ? colors.brand : colors.surfaceAlt }]} accessibilityRole="radio" accessibilityState={{ selected: active }} testID={`feed-category-${c.key}`}>
                <Ionicons name={c.icon as IconName} size={16} color={active ? colors.onBrand : c.color} />
                <AppText variant="caption" color={active ? colors.onBrand : colors.text} style={{ fontFamily: boldFont.semibold }}>
                  {c.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
      <OptionSheet visible={sheet === "condition"} onClose={() => setSheet(null)} title="Condition" options={(meta?.conditions ?? []).map((c) => ({ key: c.key, label: c.label }))} value={condition} onPick={(k) => setCondition(k)} testIDPrefix="feed-condition" />
      <OptionSheet visible={sheet === "delivery"} onClose={() => setSheet(null)} title="Pickup or delivery" options={(meta?.delivery ?? []).map((c) => ({ key: c.key, label: c.label }))} value={delivery} onPick={(k) => setDelivery(k as any)} testIDPrefix="feed-delivery" />
      <OptionSheet visible={sheet === "service"} onClose={() => setSheet(null)} title="What service do you offer?" options={(meta?.service_categories ?? []).map((s) => ({ key: s, label: s }))} value={serviceCategory} onPick={(k) => setServiceCategory(k)} testIDPrefix="feed-service" />
      <OptionSheet
        visible={sheet === "visibility"}
        onClose={() => setSheet(null)}
        title="Who can see this post"
        options={[
          { key: "estate", label: meta?.scopes.estates[0]?.name ?? "Your estate", caption: meta?.scopes.estates.length ? "Only approved residents of your estate" : "Join your estate to unlock", disabled: !meta?.scopes.estates.length, icon: "home" },
          { key: "area", label: meta?.scopes.areas[0] ?? "Your area", caption: meta?.scopes.areas.length ? "Your estate and nearby streets" : "Set by your estate", disabled: !meta?.scopes.areas.length, icon: "navigate" },
          { key: "city", label: meta?.scopes.city ?? "City", caption: "Everyone in the city", icon: "business" },
          { key: "everyone", label: "Everyone on AMASS", caption: "Widest reach — all cities", icon: "globe" },
        ]}
        value={visibility}
        onPick={(k) => setVisibility(k as Vis)}
        testIDPrefix="feed-visibility"
      />
      <Sheet visible={sheet === "property" || sheet === "products"} onClose={() => setSheet(null)} title={sheet === "property" ? "Pick a listing" : "Tag a brand product"} scroll testID="feed-picker-sheet">
        <Input value={pickerQ} onChangeText={setPickerQ} placeholder={sheet === "property" ? "Search your listings or any home…" : "Search products, brands…"} iconLeft="search-outline" autoFocus testID="feed-picker-search" />
        <View style={{ gap: 6 }}>
          {pickerItems.map((it: any) => (
            <Pressable
              key={it.id}
              onPress={() => {
                if (sheet === "property") setProperty(it);
                else setTaggedProducts((t) => (t.some((x) => x.id === it.id) ? t : [...t, { id: it.id, name: it.name, image: it.image, brand: it.brand }]));
                setSheet(null);
              }}
              style={[styles.pickRow, { backgroundColor: colors.surfaceAlt }]}
              accessibilityRole="button"
              accessibilityLabel={it.title ?? it.name}
              testID={`feed-picker-${it.id}`}
            >
              <View style={[styles.pickImg, { backgroundColor: colors.surface }]}>{it.image ? <Image source={{ uri: mediaUrl(it.image) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={sheet === "property" ? "home-outline" : "cube-outline"} size={18} color={colors.textTertiary} />}</View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodySm" numberOfLines={1} style={{ fontFamily: boldFont.semibold }}>
                  {it.title ?? it.name}
                </AppText>
                <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                  {sheet === "property" ? `${naira(it.price)} · ${it.city ?? ""}${it.mine ? " · Yours" : ""}` : `${it.brand ?? ""}${typeof it.price === "number" ? ` · ${naira(it.price)}` : it.price?.amount ? ` · ${naira(it.price.amount)}` : ""}`}
                </AppText>
              </View>
            </Pressable>
          ))}
          {!pickerItems.length ? (
            <AppText variant="caption" tone="tertiary" align="center" style={{ paddingVertical: 12 }}>
              Nothing found yet — try another word.
            </AppText>
          ) : null}
        </View>
      </Sheet>
      <Sheet visible={sheet === "photo"} onClose={() => setSheet(null)} title="Photo" testID="feed-photo-sheet">
        <View style={{ gap: 8 }}>
          {photoIdx !== null && photoIdx > 0 ? <Button label="Make this the cover" variant="secondary" size="lg" fullWidth iconLeft="star-outline" onPress={() => { setPhotos((p) => { const n = [...p]; const [x] = n.splice(photoIdx, 1); return [x, ...n]; }); setSheet(null); }} testID="feed-photo-cover" /> : null}
          <Button label="Remove photo" variant="destructive" size="lg" fullWidth iconLeft="trash-outline" onPress={() => { setPhotos((p) => p.filter((_, i) => i !== photoIdx)); setSheet(null); }} testID="feed-photo-remove" />
        </View>
        <SheetLink label="cancel" onPress={() => setSheet(null)} />
      </Sheet>
    </Screen>
  );
}

function OptionSheet({ visible, onClose, title, options, value, onPick, testIDPrefix }: { visible: boolean; onClose: () => void; title: string; options: { key: string; label: string; caption?: string; disabled?: boolean; icon?: string }[]; value: string | null; onPick: (k: string) => void; testIDPrefix: string }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} scroll testID={`${testIDPrefix}-sheet`}>
      <View style={{ gap: 6 }}>
        {options.map((o) => {
          const active = value === o.key;
          return (
            <Pressable key={o.key} disabled={o.disabled} onPress={() => { onPick(o.key); onClose(); }} style={[styles.optionRow, { backgroundColor: active ? colors.brandSoft : colors.surfaceAlt, opacity: o.disabled ? 0.55 : 1 }]} accessibilityRole="radio" accessibilityState={{ selected: active, disabled: o.disabled }} testID={`${testIDPrefix}-${o.key.replace(/\s+/g, "_").toLowerCase()}`}>
              {o.icon ? <Ionicons name={o.icon as IconName} size={18} color={active ? colors.brand : colors.text} /> : null}
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium">{o.label}</AppText>
                {o.caption ? (
                  <AppText variant="caption" tone="tertiary">
                    {o.caption}
                  </AppText>
                ) : null}
              </View>
              <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={20} color={active ? colors.brand : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

function DetailRow({ icon, label, value, onPress, missing, last, testID }: { icon: IconName; label: string; value: string; onPress: () => void; missing?: boolean; last?: boolean; testID: string }) {
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

function ToggleLine({ label, caption, value, onChange, disabled, last, testID }: { label: string; caption: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.toggleRow, styles.rowPad, !last && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyMedium">{label}</AppText>
        <AppText variant="caption" tone="tertiary">
          {caption}
        </AppText>
      </View>
      <Toggle value={value} onChange={onChange} label={label} disabled={disabled} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 6 },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: boldFont.bold, fontSize: 19, lineHeight: 24 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radii.pill },
  textCard: { borderRadius: radii.xl, borderWidth: 1, padding: 14 },
  titleInput: { fontFamily: boldFont.black, fontSize: 20, lineHeight: 26, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 6 },
  bodyInput: { fontSize: 17, lineHeight: 25, fontFamily: "PlusJakartaSans-500", minHeight: 110, textAlignVertical: "top", paddingTop: 6 },
  mention: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 10, borderRadius: radii.pill },
  photo: { width: 112, height: 112, borderRadius: radii.lg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  addPhoto: { borderWidth: 1.5, borderStyle: "dashed", gap: 6 },
  coverTag: { position: "absolute", left: 8, bottom: 8, backgroundColor: "rgba(17,17,17,0.7)", paddingHorizontal: 8, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  removeX: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  q: { fontFamily: boldFont.black, fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
  rows: { borderRadius: radii.lg, borderWidth: 1, overflow: "hidden" },
  rowPad: { padding: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, minHeight: 56 },
  hint: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  propPick: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radii.lg, borderWidth: 1 },
  propImg: { width: 56, height: 56, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: radii.pill, maxWidth: 220 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radii.pill },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: radii.md },
  pickImg: { width: 44, height: 44, borderRadius: radii.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
