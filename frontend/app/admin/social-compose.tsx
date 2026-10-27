/**
 * Admin — compose a social post: pick a listing → preview photo + per-platform captions (editable) → publish.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api, ApiError, type PublishCompose, type PublishListing, type SocialPlatform, type PublishPost } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, SkeletonRows, useToast } from "@/src/ui";

const PLATFORM_COLORS: Record<SocialPlatform, string> = { facebook: "#1877F2", instagram: "#E1306C", x: "#111111", linkedin: "#0A66C2", tiktok: "#010101" }; // brand colours
const PLATFORM_LABELS: Record<SocialPlatform, string> = { facebook: "Facebook", instagram: "Instagram", x: "X", linkedin: "LinkedIn", tiktok: "TikTok" };

function errMsg(e: any, fallback: string) {
  return e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? fallback;
}

export default function AdminPublishComposeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { property_id } = useLocalSearchParams<{ property_id?: string }>();
  const [search, setSearch] = useState("");
  const [listings, setListings] = useState<PublishListing[] | null>(null);
  const [selected, setSelected] = useState<string | null>(property_id ?? null);
  const [compose, setCompose] = useState<PublishCompose | null>(null);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [active, setActive] = useState<SocialPlatform>("facebook");
  const [captions, setCaptions] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishPost | null>(null);

  const loadListings = useCallback(async (q: string) => {
    try {
      const r = await api.adminPublishListings(q || undefined);
      setListings(r.items);
    } catch (e: any) {
      toast.error("Couldn't load listings", errMsg(e, "Please try again."));
      setListings([]);
    }
  }, [toast]);

  useEffect(() => {
    if (!user?.is_admin || selected) return;
    const t = setTimeout(() => loadListings(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [user, search, selected, loadListings]);

  useEffect(() => {
    if (!selected) {
      setCompose(null);
      setResult(null);
      return;
    }
    let alive = true;
    setCompose(null);
    api
      .adminPublishCompose(selected)
      .then((c) => {
        if (!alive) return;
        setCompose(c);
        setCaptions({});
        setImage(c.image_url ?? null);
        const connected = c.platforms.filter((p) => p.connected).map((p) => p.platform);
        setPlatforms(connected.length ? connected : c.platforms.map((p) => p.platform));
        setActive(connected[0] ?? "facebook");
      })
      .catch((e: any) => {
        toast.error("Couldn't prepare the post", errMsg(e, "Please try again."));
        setSelected(null);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const caption = (p: SocialPlatform) => captions[p] ?? compose?.captions[p] ?? "";
  const limit = (p: SocialPlatform) => compose?.platforms.find((x) => x.platform === p)?.limit ?? 2200;
  const xLen = useMemo(() => {
    // t.co wraps links to 23 chars
    const t = caption("x");
    return t.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captions, compose]);

  const publish = async () => {
    if (!compose || !platforms.length) return toast.error("Pick at least one platform");
    if (platforms.includes("x") && xLen > 280) return toast.error("The X caption is over 280 characters");
    setBusy(true);
    try {
      const r = await api.adminSocialPublish({ property_id: compose.property.id, platforms, captions, image_url: image ?? undefined });
      setResult(r);
      const posted = Object.values(r.results).filter((x) => x.status === "posted").length;
      if (r.status === "posted") toast.success("Published", `Live on ${posted} platform${posted === 1 ? "" : "s"}.`);
      else if (r.status === "queued") toast.info("Saved — waiting for connections", "Connect the accounts in Social publishing and tap Publish waiting.");
      else toast.info(`Published to ${posted} of ${platforms.length}`, "See the results below.");
    } catch (e: any) {
      toast.error("Couldn't publish", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen testID="admin-social-compose-denied">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Post a listing" />
        <EmptyState variant="error" title="Admin only" body="This area is for AMASS Admin." />
      </Screen>
    );
  }

  // ─── step 1: pick a listing ───
  if (!selected) {
    return (
      <Screen testID="admin-social-compose-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Post a listing" subtitle="Step 1 · choose a verified listing" />
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Input value={search} onChangeText={setSearch} placeholder="Search title, area or agent" iconLeft="search" autoCapitalize="none" autoCorrect={false} testID="admin-social-pick-search" />
          {!listings ? (
            <SkeletonRows rows={6} />
          ) : listings.length === 0 ? (
            <EmptyState icon="home-outline" title="No listings with photos" body="Only listings with at least one photo can be posted." testID="admin-social-pick-empty" />
          ) : (
            listings.map((l) => (
              <Card key={l.id} onPress={() => setSelected(l.id)} elevation="xs" testID={`admin-social-pick-${l.id}`}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>{l.images?.[0] ? <Image source={{ uri: l.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}</View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <AppText variant="bodyMedium" numberOfLines={1}>
                      {l.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1}>
                      {l.price_label} · {l.location_label}
                    </AppText>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {l.verified ? <Badge label="Verified" tone="success" size="xs" /> : <Badge label="Not verified" tone="neutral" size="xs" />}
                      {l.already_posted ? <Badge label="Posted before" tone="info" size="xs" /> : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      </Screen>
    );
  }

  // ─── step 2: preview + publish ───
  return (
    <Screen testID="admin-social-compose-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Post a listing" subtitle="Step 2 · preview and publish" onBack={() => (result ? router.back() : setSelected(null))} />
      {!compose ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={6} />
        </View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 40 }} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Card elevation="xs" testID="admin-social-compose-property">
            <View style={{ gap: 10 }}>
              <View style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}>{image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="image-outline" size={28} color={colors.textTertiary} />}</View>
              {compose.property.images.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {compose.property.images.map((u, i) => (
                    <Pressable key={u} onPress={() => setImage(u)} accessibilityRole="button" accessibilityLabel={`Use photo ${i + 1}`} style={[styles.pick, { borderColor: image === u ? colors.brand : "transparent" }]} testID={`admin-social-compose-photo-${i}`}>
                      <Image source={{ uri: u }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <View>
                <AppText variant="title" numberOfLines={2}>
                  {compose.property.title}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {compose.property.price_label} · {compose.property.location_label}
                  {compose.property.specs ? ` · ${compose.property.specs}` : ""}
                </AppText>
              </View>
              {compose.previous_posts.length ? (
                <AppText variant="micro" tone="tertiary">
                  Posted before · {compose.previous_posts.length} time{compose.previous_posts.length === 1 ? "" : "s"} (latest {new Date(compose.previous_posts[0].created_at).toLocaleDateString()})
                </AppText>
              ) : null}
            </View>
          </Card>

          <View style={{ gap: 8 }}>
            <AppText variant="label" tone="secondary" uppercase>
              Post to
            </AppText>
            <View style={styles.chips}>
              {compose.platforms.map((p) => (
                <Chip key={p.platform} label={p.connected ? p.label : `${p.label} · not connected`} icon={p.icon as any} selected={platforms.includes(p.platform)} onPress={() => setPlatforms((cur) => (cur.includes(p.platform) ? cur.filter((x) => x !== p.platform) : [...cur, p.platform]))} testID={`admin-social-compose-platform-${p.platform}`} />
              ))}
            </View>
            {platforms.some((p) => !compose.platforms.find((x) => x.platform === p)?.connected) ? (
              <AppText variant="micro" tone="tertiary">
                Unconnected platforms are saved as “waiting” and go out once you connect them.
              </AppText>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <AppText variant="label" tone="secondary" uppercase>
              Caption
            </AppText>
            <View style={styles.chips}>
              {compose.platforms
                .filter((p) => platforms.includes(p.platform))
                .map((p) => (
                  <Pressable key={p.platform} onPress={() => setActive(p.platform)} accessibilityRole="tab" accessibilityLabel={`${p.label} caption`} style={[styles.tab, { backgroundColor: active === p.platform ? PLATFORM_COLORS[p.platform] : colors.surfaceAlt }]} testID={`admin-social-compose-tab-${p.platform}`}>
                    <Ionicons name={p.icon as any} size={14} color={active === p.platform ? "#fff" : colors.textSecondary} />
                    <AppText variant="caption" color={active === p.platform ? "#fff" : colors.textSecondary}>
                      {p.label}
                    </AppText>
                  </Pressable>
                ))}
            </View>
            {platforms.includes(active) ? (
              <>
                <Input value={caption(active)} onChangeText={(t) => setCaptions((c) => ({ ...c, [active]: t }))} multiline style={{ minHeight: 200 }} testID={`admin-social-compose-caption-${active}`} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <AppText variant="micro" tone={(active === "x" ? xLen : caption(active).length) > limit(active) ? "error" : "tertiary"}>
                    {active === "x" ? `${xLen} / 280 (links count as 23)` : `${caption(active).length} / ${limit(active)}`}
                    {active === "instagram" ? " · no clickable links on Instagram" : ""}
                  </AppText>
                  {captions[active] ? <Button label="Reset" size="sm" variant="ghost" onPress={() => setCaptions((c) => { const n = { ...c }; delete n[active]; return n; })} testID="admin-social-compose-reset" /> : null}
                </View>
              </>
            ) : (
              <AppText variant="caption" tone="tertiary">
                Select a platform above to edit its caption.
              </AppText>
            )}
          </View>

          <Card tone="soft" testID="admin-social-compose-link">
            <AppText variant="label" tone="secondary" uppercase>
              Smart link in this post
            </AppText>
            <AppText variant="micro" tone="tertiary" selectable style={{ marginTop: 4 }}>
              {compose.link.replace("?src=preview", "?src=<platform>")}
            </AppText>
            <AppText variant="micro" tone="tertiary" style={{ marginTop: 4 }}>
              Opens the listing in the AMASS app; without the app → store or web listing. Every open is counted per platform.
            </AppText>
          </Card>

          {result ? (
            <Card elevation="xs" testID="admin-social-compose-result">
              <View style={{ gap: 8 }}>
                <AppText variant="title">Result</AppText>
                {result.platforms.map((pl) => {
                  const r = result.results[pl];
                  return (
                    <View key={pl} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Badge label={r?.status === "queued" ? "waiting" : r?.status ?? "pending"} tone={r?.status === "posted" ? "success" : r?.status === "failed" ? "error" : "warning"} size="xs" />
                      <AppText variant="caption" tone={r?.status === "failed" ? "error" : "secondary"} style={{ flex: 1 }} numberOfLines={2}>
                        {PLATFORM_LABELS[pl]}
                        {r?.error ? ` — ${r.error}` : r?.note ? ` — ${r.note}` : r?.url ? ` — ${r.url}` : ""}
                      </AppText>
                    </View>
                  );
                })}
                <Button label="Back to Social publishing" variant="secondary" iconLeft="arrow-back" onPress={() => router.replace("/admin/social" as any)} testID="admin-social-compose-done" />
              </View>
            </Card>
          ) : (
            <Button label={`Publish to ${platforms.length} platform${platforms.length === 1 ? "" : "s"}`} variant="primary" size="lg" fullWidth iconLeft="paper-plane" onPress={publish} loading={busy} disabled={!platforms.length} testID="admin-social-compose-publish" />
          )}
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 56, height: 56, borderRadius: radii.md, overflow: "hidden" },
  hero: { width: "100%", aspectRatio: 4 / 3, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  pick: { width: 64, height: 64, borderRadius: radii.sm, overflow: "hidden", borderWidth: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill },
});
