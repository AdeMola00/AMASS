/**
 * Listing Story — swipeable 9:16 slides (Cover · Gallery · Details) rendered
 * from a listing's real photos, exported as 1080×1920 PNGs and handed to the
 * system share sheet so agents can post them to WhatsApp Status in one tap.
 * Slides keep a fixed print-safe palette regardless of light/dark theme.
 */
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Platform, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import ViewShot, { captureRef } from "react-native-view-shot";
import QRCode from "react-native-qrcode-svg";
import { api, ApiError, type ListingStory } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { fontFamilies, palette, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Button, EmptyState, GlassFill, Gloss, PhotoSheen, Screen, ScreenHeader, Skeleton, useToast, type IconName } from "@/src/ui";
import { AmassLogo } from "@/src/components/AmassLogo";

type SlideKind = "cover" | "gallery" | "details";
const SLIDES: { kind: SlideKind; label: string; icon: IconName }[] = [
  { kind: "cover", label: "Cover", icon: "image" },
  { kind: "gallery", label: "Gallery", icon: "grid" },
  { kind: "details", label: "Details", icon: "document-text" },
];
const WHATSAPP_GREEN = "#25D366"; // third-party brand colour
const INK = palette.neutral[1000];
const PAPER = palette.neutral[0];
const RED = palette.red[500];
const MUTED = palette.neutral[400];
const SECOND = palette.neutral[600];
const SOFT = palette.neutral[100];
const LINE = palette.neutral[200];

export default function ListingStoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { width: screenW } = useWindowDimensions();
  const [story, setStory] = useState<ListingStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ locked: boolean; message: string } | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<"one" | "series" | "caption" | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const refs = useRef<any[]>([]);
  const listRef = useRef<FlatList>(null);

  const W = Math.min(screenW - 72, 300);
  const H = Math.round((W * 16) / 9);
  const GAP = 14;

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setStory(await api.propertyStory(id));
    } catch (e: any) {
      const locked = e instanceof ApiError && e.status === 403;
      setError({ locked, message: locked ? "Unlock this listing to turn its photos into a story." : (e?.message ?? "Couldn't prepare the story.") });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (W + GAP));
    if (i !== index && i >= 0 && i < SLIDES.length) {
      setIndex(i);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const capture = async (i: number) => captureRef(refs.current[i], { format: "png", quality: 1, result: "tmpfile", width: 1080, height: 1920 });

  const shareOne = async (i: number, dialogTitle: string) => {
    const uri = await capture(i);
    await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle, UTI: "public.png" });
  };

  const ensureSharing = async () => {
    if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) {
      toast.info("Open in the AMASS app", "Posting to WhatsApp Status works from your phone — the caption has been copied for you.");
      if (story) await Clipboard.setStringAsync(story.caption).catch(() => {});
      return false;
    }
    return true;
  };

  const postCurrent = async () => {
    if (!story || !id) return;
    setBusy("one");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      if (!(await ensureSharing())) return;
      await Clipboard.setStringAsync(story.caption).catch(() => {});
      await shareOne(index, "Post to WhatsApp Status");
      api.recordPropertyShare(id, "story", SLIDES[index].kind).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Story shared", "Caption copied — paste it in WhatsApp for the link.");
    } catch (e: any) {
      toast.error("Couldn't share the story", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const postSeries = async () => {
    if (!story || !id) return;
    setBusy("series");
    try {
      if (!(await ensureSharing())) return;
      await Clipboard.setStringAsync(story.caption).catch(() => {});
      for (let i = 0; i < SLIDES.length; i++) {
        setProgress(`Posting slide ${i + 1} of ${SLIDES.length} · ${SLIDES[i].label}`);
        listRef.current?.scrollToIndex({ index: i, animated: true });
        await shareOne(i, `Slide ${i + 1} of ${SLIDES.length} · ${SLIDES[i].label}`);
      }
      api.recordPropertyShare(id, "story_series", "all").catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Series posted", "All three slides were handed to WhatsApp in order.");
    } catch (e: any) {
      toast.error("Series stopped", e?.message ?? "You can post the remaining slides one by one.");
    } finally {
      setProgress(null);
      setBusy(null);
    }
  };

  const copyCaption = async () => {
    if (!story) return;
    setBusy("caption");
    await Clipboard.setStringAsync(story.caption);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.success("Caption copied", "Includes the price, specs and your AMASS link.");
    setBusy(null);
  };

  if (loading) {
    return (
      <Screen testID="story-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Listing story" />
        <View style={{ alignItems: "center", padding: space[4], gap: 14 }}>
          <Skeleton height={H} width={W} radius={radii.xl} />
          <Skeleton height={54} radius={radii.pill} style={{ alignSelf: "stretch" }} />
        </View>
      </Screen>
    );
  }

  if (error || !story) {
    return (
      <Screen testID="story-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Listing story" />
        <EmptyState
          variant={error?.locked ? "empty" : "error"}
          icon={error?.locked ? "lock-closed-outline" : "alert-circle-outline"}
          title={error?.locked ? "Unlock to create a story" : "Couldn't load the story"}
          body={error?.message ?? "Please try again."}
          actionLabel={error?.locked ? "View listing" : "Retry"}
          onAction={() => (error?.locked ? router.replace(`/property/${id}` as any) : load())}
          secondaryLabel="Go back"
          onSecondary={() => router.back()}
          testID="story-error"
        />
      </Screen>
    );
  }

  return (
    <Screen testID="story-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Listing story" subtitle="Swipe to pick a slide · post to WhatsApp Status" />
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(s) => s.kind}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={W + GAP}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: (screenW - W) / 2, gap: GAP, paddingVertical: 8 }}
          getItemLayout={(_, i) => ({ length: W + GAP, offset: (W + GAP) * i, index: i })}
          renderItem={({ item, index: i }) => (
            <ViewShot
              ref={(r) => {
                refs.current[i] = r;
              }}
              options={{ format: "png", quality: 1 }}
              style={[styles.slideWrap, { width: W, height: H }]}
            >
              <StorySlide kind={item.kind} story={story} w={W} h={H} testID={`story-slide-${item.kind}`} />
            </ViewShot>
          )}
          testID="story-slides"
        />
        {/* Dots + slide label */}
        <View style={styles.dotsRow}>
          {SLIDES.map((s, i) => (
            <View key={s.kind} style={[styles.dot, { backgroundColor: i === index ? colors.text : colors.borderStrong, width: i === index ? 22 : 7 }]} />
          ))}
          <AppText variant="caption" tone="secondary" style={{ marginLeft: 8 }} testID="story-slide-label">
            {SLIDES[index].label} · {index + 1}/{SLIDES.length}
          </AppText>
        </View>
      </View>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) + 4, backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
        {progress ? (
          <View style={[styles.progress, { backgroundColor: colors.successSoft }]} testID="story-progress">
            <Ionicons name="sync" size={14} color={colors.success} />
            <AppText variant="caption" color={colors.success}>
              {progress}
            </AppText>
          </View>
        ) : null}
        <Button label="Post to WhatsApp Status" iconLeft="logo-whatsapp" size="lg" fullWidth loading={busy === "one"} disabled={busy !== null && busy !== "one"} onPress={postCurrent} style={{ backgroundColor: WHATSAPP_GREEN }} testID="story-post" />
        <View style={styles.row}>
          <Button label="Post all 3 as a series" iconLeft="albums-outline" variant="secondary" style={{ flex: 1 }} loading={busy === "series"} disabled={busy !== null && busy !== "series"} onPress={postSeries} testID="story-post-series" />
          <Button label="Copy caption" iconLeft="copy-outline" variant="secondary" style={{ flex: 1 }} loading={busy === "caption"} disabled={busy !== null && busy !== "caption"} onPress={copyCaption} testID="story-copy-caption" />
        </View>
        <AppText variant="micro" tone="tertiary" align="center">
          In WhatsApp choose <AppText variant="micro" weight="bold" tone="secondary">My Status</AppText>. Paste the caption so viewers get your AMASS link.
        </AppText>
      </View>
    </Screen>
  );
}

/* ─── Slides ─────────────────────────────────────────────────────────────── */
function StorySlide({ kind, story, w, h, testID }: { kind: SlideKind; story: ListingStory; w: number; h: number; testID?: string }) {
  const s = w / 360; // design scale (base 360×640)
  const p = story.property;
  const imgs = p.images.length ? p.images : [];
  const price = formatNaira(p.price || 0);
  const where = [p.city, p.state].filter(Boolean).join(", ") || p.location || "";
  const specs = [p.bedrooms ? { icon: "bed" as IconName, v: `${p.bedrooms} bed` } : null, p.bathrooms ? { icon: "water" as IconName, v: `${p.bathrooms} bath` } : null, p.size_sqm ? { icon: "expand" as IconName, v: `${p.size_sqm} sqm` } : null].filter(Boolean) as { icon: IconName; v: string }[];
  const kicker = `${(p.listing_type === "buy" ? "for sale" : p.listing_type === "rent" ? "for rent" : p.listing_type || "for sale").toUpperCase()}${p.property_type ? ` · ${p.property_type.toUpperCase()}` : ""}`;

  if (kind === "cover") {
    return (
      <View style={[styles.slide, { width: w, height: h, backgroundColor: INK }]} testID={testID}>
        {imgs[0] ? <Image source={{ uri: imgs[0] }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <LinearGradient colors={["rgba(17,17,17,0.35)", "rgba(17,17,17,0)"]} style={[StyleSheet.absoluteFill, { bottom: "70%" }]} />
        <LinearGradient colors={["rgba(17,17,17,0)", "rgba(17,17,17,0.55)", "rgba(17,17,17,0.92)"]} locations={[0, 0.5, 1]} style={[StyleSheet.absoluteFill, { top: "35%" }]} />
        <PhotoSheen radius={0} strength={0.6} />
        <View style={[styles.coverTop, { padding: 18 * s }]}>
          <View style={[styles.brandPill, { paddingHorizontal: 10 * s, height: 30 * s, borderRadius: 15 * s }]}>
            <AmassLogo size={18 * s} showWordmark={false} />
            <AppText style={{ fontSize: 12 * s, lineHeight: 14 * s, letterSpacing: 2, fontFamily: fontFamilies.extrabold }} color={INK}>
              AMASS
            </AppText>
          </View>
          {p.verified ? (
            <View style={[styles.verifiedPill, { height: 28 * s, paddingHorizontal: 10 * s, borderRadius: 14 * s }]}>
              <Ionicons name="shield-checkmark" size={12 * s} color={PAPER} />
              <AppText style={{ fontSize: 10 * s, lineHeight: 12 * s, letterSpacing: 1, fontFamily: fontFamilies.bold }} color={PAPER}>
                VERIFIED
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={[styles.coverBottom, { padding: 20 * s, gap: 10 * s }]}>
          <View style={[styles.kicker, { backgroundColor: RED, paddingHorizontal: 8 * s, height: 22 * s, borderRadius: 6 * s }]}>
            <AppText style={{ fontSize: 10 * s, lineHeight: 12 * s, letterSpacing: 1.2, fontFamily: fontFamilies.bold }} color={PAPER}>
              {kicker}
            </AppText>
          </View>
          <AppText style={{ fontSize: 30 * s, lineHeight: 34 * s, fontFamily: fontFamilies.extrabold }} color={PAPER} numberOfLines={3}>
            {p.title}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 * s }}>
            <Ionicons name="location" size={14 * s} color="rgba(255,255,255,0.8)" />
            <AppText style={{ fontSize: 13 * s, lineHeight: 16 * s, fontFamily: fontFamilies.medium }} color="rgba(255,255,255,0.85)" numberOfLines={1}>
              {p.location && p.city && !p.location.includes(p.city) ? `${p.location}, ${p.city}` : p.location || where}
            </AppText>
          </View>
          <View style={[styles.pricePlate, { paddingHorizontal: 14 * s, paddingVertical: 8 * s, borderRadius: 14 * s }]}>
            <GlassFill tone="dark" radius={14 * s} />
            <AppText style={{ fontSize: 26 * s, lineHeight: 30 * s, fontFamily: fontFamilies.extrabold, fontVariant: ["tabular-nums"] }} color={PAPER}>
              {price}
            </AppText>
          </View>
          {specs.length ? (
            <View style={{ flexDirection: "row", gap: 8 * s, flexWrap: "wrap" }}>
              {specs.map((x) => (
                <View key={x.v} style={{ flexDirection: "row", alignItems: "center", gap: 4 * s }}>
                  <Ionicons name={x.icon} size={12 * s} color="rgba(255,255,255,0.85)" />
                  <AppText style={{ fontSize: 12 * s, lineHeight: 14 * s, fontFamily: fontFamilies.semibold }} color="rgba(255,255,255,0.9)">
                    {x.v}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[styles.hairline, { marginTop: 4 * s }]} />
          <AppText style={{ fontSize: 11 * s, lineHeight: 13 * s, fontFamily: fontFamilies.medium, letterSpacing: 0.6 }} color="rgba(255,255,255,0.7)">
            {story.brand.domain} · link in caption
          </AppText>
        </View>
      </View>
    );
  }

  if (kind === "gallery") {
    const tiles = [0, 1, 2, 3].map((i) => imgs[i % Math.max(1, imgs.length)]).filter(Boolean);
    const tileW = (w - 20 * s * 2 - 8 * s) / 2;
    const tileH = tileW * 1.18;
    return (
      <View style={[styles.slide, { width: w, height: h, backgroundColor: INK }]} testID={testID}>
        <LinearGradient colors={["#1E1E1C", INK]} style={StyleSheet.absoluteFill} />
        <Gloss height="30%" opacity={0.5} />
        <View style={{ padding: 20 * s, gap: 6 * s }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 * s }}>
            <AmassLogo size={20 * s} showWordmark={false} />
            <AppText style={{ fontSize: 12 * s, lineHeight: 14 * s, letterSpacing: 2.5, fontFamily: fontFamilies.extrabold }} color={PAPER}>
              AMASS
            </AppText>
            <View style={{ flex: 1 }} />
            {p.verified ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 * s }}>
                <Ionicons name="shield-checkmark" size={12 * s} color="#7ED958" />
                <AppText style={{ fontSize: 10 * s, lineHeight: 12 * s, letterSpacing: 1, fontFamily: fontFamilies.bold }} color="#7ED958">
                  VERIFIED
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText style={{ fontSize: 22 * s, lineHeight: 26 * s, fontFamily: fontFamilies.extrabold, marginTop: 10 * s }} color={PAPER} numberOfLines={2}>
            {p.title}
          </AppText>
          <AppText style={{ fontSize: 12 * s, lineHeight: 15 * s, fontFamily: fontFamilies.medium }} color="rgba(255,255,255,0.7)" numberOfLines={1}>
            {where}
          </AppText>
        </View>
        <View style={{ paddingHorizontal: 20 * s, flexDirection: "row", flexWrap: "wrap", gap: 8 * s }}>
          {tiles.map((uri, i) => (
            <View key={`${uri}-${i}`} style={{ width: tileW, height: tileH, borderRadius: 14 * s, overflow: "hidden", backgroundColor: "#2A2A28" }}>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <PhotoSheen radius={14 * s} strength={0.9} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ padding: 20 * s, gap: 10 * s }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View>
              <AppText style={{ fontSize: 10 * s, lineHeight: 12 * s, letterSpacing: 1.2, fontFamily: fontFamilies.bold }} color={RED}>
                {kicker}
              </AppText>
              <AppText style={{ fontSize: 28 * s, lineHeight: 32 * s, fontFamily: fontFamilies.extrabold, fontVariant: ["tabular-nums"] }} color={PAPER}>
                {price}
              </AppText>
            </View>
            {specs.length ? (
              <View style={{ alignItems: "flex-end", gap: 2 * s }}>
                {specs.map((x) => (
                  <AppText key={x.v} style={{ fontSize: 11 * s, lineHeight: 13 * s, fontFamily: fontFamilies.semibold }} color="rgba(255,255,255,0.85)">
                    {x.v}
                  </AppText>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.hairline} />
          <AppText style={{ fontSize: 11 * s, lineHeight: 13 * s, fontFamily: fontFamilies.medium, letterSpacing: 0.6 }} color="rgba(255,255,255,0.65)">
            {story.brand.domain} · link in caption
          </AppText>
        </View>
      </View>
    );
  }

  // details
  const agent = story.agent;
  return (
    <View style={[styles.slide, { width: w, height: h, backgroundColor: PAPER }]} testID={testID}>
      <View style={{ height: h * 0.42, backgroundColor: SOFT }}>
        {imgs[0] ? <Image source={{ uri: imgs[0] }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <LinearGradient colors={["rgba(17,17,17,0.35)", "rgba(17,17,17,0)"]} style={[StyleSheet.absoluteFill, { bottom: "55%" }]} />
        <View style={[styles.coverTop, { padding: 16 * s }]}>
          <View style={[styles.brandPill, { paddingHorizontal: 10 * s, height: 30 * s, borderRadius: 15 * s }]}>
            <AmassLogo size={18 * s} showWordmark={false} />
            <AppText style={{ fontSize: 12 * s, lineHeight: 14 * s, letterSpacing: 2, fontFamily: fontFamilies.extrabold }} color={INK}>
              AMASS
            </AppText>
          </View>
          {p.verified ? (
            <View style={[styles.verifiedPill, { height: 28 * s, paddingHorizontal: 10 * s, borderRadius: 14 * s }]}>
              <Ionicons name="shield-checkmark" size={12 * s} color={PAPER} />
              <AppText style={{ fontSize: 10 * s, lineHeight: 12 * s, letterSpacing: 1, fontFamily: fontFamilies.bold }} color={PAPER}>
                VERIFIED
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flex: 1, padding: 18 * s, gap: 8 * s }}>
        <AppText style={{ fontSize: 10 * s, lineHeight: 12 * s, letterSpacing: 1.2, fontFamily: fontFamilies.bold }} color={RED}>
          {kicker}
        </AppText>
        <AppText style={{ fontSize: 20 * s, lineHeight: 24 * s, fontFamily: fontFamilies.extrabold }} color={INK} numberOfLines={2}>
          {p.title}
        </AppText>
        <AppText style={{ fontSize: 12 * s, lineHeight: 15 * s, fontFamily: fontFamilies.medium }} color={SECOND} numberOfLines={1}>
          {p.location && p.city && !p.location.includes(p.city) ? `${p.location}, ${p.city}` : p.location || where}
        </AppText>
        <AppText style={{ fontSize: 26 * s, lineHeight: 30 * s, fontFamily: fontFamilies.extrabold, fontVariant: ["tabular-nums"], marginTop: 2 * s }} color={INK}>
          {price}
        </AppText>
        {specs.length ? (
          <View style={{ flexDirection: "row", gap: 6 * s, flexWrap: "wrap" }}>
            {specs.map((x) => (
              <View key={x.v} style={[styles.specChip, { backgroundColor: SOFT, paddingHorizontal: 9 * s, height: 24 * s, borderRadius: 12 * s, gap: 4 * s }]}>
                <Ionicons name={x.icon} size={11 * s} color={INK} />
                <AppText style={{ fontSize: 11 * s, lineHeight: 13 * s, fontFamily: fontFamilies.bold }} color={INK}>
                  {x.v}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        {p.amenities?.length ? (
          <AppText style={{ fontSize: 11 * s, lineHeight: 15 * s, fontFamily: fontFamilies.medium }} color={SECOND} numberOfLines={2}>
            {p.amenities.slice(0, 4).join(" · ")}
          </AppText>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={[styles.detailsFooter, { borderTopColor: LINE, paddingTop: 12 * s, gap: 12 * s }]}>
          <View style={{ flex: 1, gap: 4 * s }}>
            {agent?.full_name ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 * s }}>
                <Avatar name={agent.full_name} uri={agent.avatar_url ?? undefined} size={30 * s} />
                <View style={{ flex: 1 }}>
                  <AppText style={{ fontSize: 9 * s, lineHeight: 11 * s, letterSpacing: 1, fontFamily: fontFamilies.bold }} color={MUTED}>
                    LISTED BY
                  </AppText>
                  <AppText style={{ fontSize: 12 * s, lineHeight: 14 * s, fontFamily: fontFamilies.bold }} color={INK} numberOfLines={1}>
                    {agent.full_name}
                  </AppText>
                  {agent.badge?.label ? (
                    <AppText style={{ fontSize: 10 * s, lineHeight: 12 * s, fontFamily: fontFamilies.semibold }} color={RED} numberOfLines={1}>
                      {agent.badge.label}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ) : null}
            <AppText style={{ fontSize: 10 * s, lineHeight: 12 * s, fontFamily: fontFamilies.medium }} color={SECOND}>
              {story.brand.domain}/property/{p.id.slice(0, 8)}…
            </AppText>
          </View>
          <View style={[styles.qr, { borderColor: LINE, padding: 5 * s, borderRadius: 10 * s }]}>
            <QRCode value={story.share_url} size={56 * s} color={INK} backgroundColor={PAPER} />
            <AppText style={{ fontSize: 8 * s, lineHeight: 10 * s, letterSpacing: 1, fontFamily: fontFamilies.bold, marginTop: 3 * s }} color={MUTED}>
              SCAN
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slideWrap: { borderRadius: radii.xl, overflow: "hidden", backgroundColor: INK },
  slide: { overflow: "hidden" },
  coverTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  coverBottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  brandPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: PAPER },
  verifiedPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: RED },
  kicker: { alignSelf: "flex-start", alignItems: "center", justifyContent: "center" },
  pricePlate: { alignSelf: "flex-start", overflow: "hidden" },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.3)" },
  specChip: { flexDirection: "row", alignItems: "center" },
  detailsFooter: { flexDirection: "row", alignItems: "center", borderTopWidth: 1 },
  qr: { alignItems: "center", borderWidth: 1, backgroundColor: PAPER },
  dotsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8 },
  dot: { height: 7, borderRadius: 4 },
  actions: { paddingHorizontal: space[4], paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", gap: 10 },
  progress: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.sm },
});
