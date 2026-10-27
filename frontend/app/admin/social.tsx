/**
 * Admin — Social publishing. Official AMASS accounts (Facebook Page, Instagram, X, LinkedIn Page, TikTok): connection
 * status + how to connect, auto-post on verification, manual posts, smart-link opens and post history.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { api, ApiError, type PublishOverview, type SocialPlatform, type PublishPlatformStatus, type PublishPost, type PublishSettings } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, StatTile, Toggle, useToast } from "@/src/ui";

const PLATFORM_COLORS: Record<SocialPlatform, string> = { facebook: "#1877F2", instagram: "#E1306C", x: "#111111", linkedin: "#0A66C2", tiktok: "#010101" }; // brand colours — identical in both themes
const PLATFORM_LABELS: Record<SocialPlatform, string> = { facebook: "Facebook", instagram: "Instagram", x: "X", linkedin: "LinkedIn", tiktok: "TikTok" };

function errMsg(e: any, fallback: string) {
  return e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? fallback;
}

function when(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function AdminSocialScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ connect?: string; ok?: string; error?: string; name?: string }>();
  const [data, setData] = useState<PublishOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [help, setHelp] = useState<SocialPlatform | null>(null);
  const [detail, setDetail] = useState<PublishPost | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.adminPublishOverview());
    } catch (e: any) {
      toast.error("Couldn't load", errMsg(e, "Please try again."));
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user?.is_admin) load();
  }, [user, load]);

  useEffect(() => {
    if (!params.connect) return;
    if (params.ok) toast.success(`${params.connect} connected`, params.name ? `Posting as ${params.name}` : undefined);
    else if (params.error) toast.error(`Couldn't connect ${params.connect}`, String(params.error));
    router.setParams({ connect: undefined, ok: undefined, error: undefined, name: undefined } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.connect]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      await load();
      return r;
    } catch (e: any) {
      toast.error("Something went wrong", errMsg(e, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const test = async (p: PublishPlatformStatus) => {
    setBusy(`test-${p.platform}`);
    try {
      const r = await api.adminSocialTest(p.platform);
      toast.success(`${p.label} is connected`, r.display_name ? `Posting as ${r.display_name}` : undefined);
      await load();
    } catch (e: any) {
      toast.error(`${p.label} check failed`, errMsg(e, "Please try again."));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const connect = async (p: PublishPlatformStatus) => {
    setBusy(`connect-${p.platform}`);
    try {
      const r = await api.adminSocialConnect(p.platform);
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-undef
        (globalThis as any).location.href = r.authorize_url;
      } else {
        await WebBrowser.openBrowserAsync(r.authorize_url);
        await load();
      }
    } catch (e: any) {
      toast.error(`Couldn't start ${p.label} sign-in`, errMsg(e, "Add the keys first."));
    } finally {
      setBusy(null);
    }
  };

  const toggleAuto = (p: SocialPlatform, v: boolean) => run(`auto-${p}`, () => api.adminPublishSettings({ auto_post: { ...(data!.settings.auto_post), [p]: v } }), v ? "Auto-post on" : "Auto-post off");

  if (!user?.is_admin) {
    return (
      <Screen testID="admin-social-denied">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Social publishing" />
        <EmptyState variant="error" title="Admin only" body="This area is for AMASS Admin." />
      </Screen>
    );
  }

  const connectedCount = data?.platforms.filter((p) => p.connected).length ?? 0;

  return (
    <Screen testID="admin-social-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Social publishing" subtitle="Official accounts · auto-post · smart links" right={<Button label="Post" size="sm" variant="primary" iconLeft="paper-plane" onPress={() => router.push("/admin/social-compose" as any)} testID="admin-social-compose" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} showsVerticalScrollIndicator={false}>
        {!data ? (
          <SkeletonRows rows={6} />
        ) : (
          <>
            <View style={styles.statRow}>
              <StatTile icon="paper-plane" tone="brand" value={data.stats.published_30d} label="Posted · 30d" />
              <StatTile icon="link" tone="info" value={data.stats.clicks_30d} label="Link opens · 30d" />
            </View>
            <View style={styles.statRow}>
              <StatTile icon="share-social" tone="default" value={connectedCount} label={`of ${data.platforms.length} connected`} />
              <StatTile icon="time" tone={data.stats.queued ? "warning" : "default"} value={data.stats.queued} label="Waiting to post" />
            </View>
            {Object.keys(data.stats.clicks_by_source).length ? (
              <Card tone="soft" testID="admin-social-clicks">
                <AppText variant="label" tone="secondary" uppercase>
                  Where app opens come from (30 days)
                </AppText>
                <View style={[styles.chips, { marginTop: 8 }]}>
                  {Object.entries(data.stats.clicks_by_source)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <Chip key={k} label={`${k} · ${v}`} selected={false} onPress={() => {}} />
                    ))}
                </View>
              </Card>
            ) : null}

            <Card tone="soft" testID="admin-social-smart-link-note">
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.brand} />
                <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                  Every post carries a smart link. On a phone it opens the listing inside the AMASS app; without the app it sends people to the App Store / Play Store (set below) or the web listing — and we count every open per platform.
                </AppText>
              </View>
            </Card>

            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <AppText variant="label" tone="secondary" uppercase>
                  Official accounts
                </AppText>
                <Button label="Settings" size="sm" variant="ghost" iconLeft="options-outline" onPress={() => setSettingsOpen(true)} testID="admin-social-settings" />
              </View>
              {data.platforms.map((p) => (
                <Card key={p.platform} elevation="xs" testID={`admin-social-platform-${p.platform}`}>
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={[styles.logo, { backgroundColor: PLATFORM_COLORS[p.platform] }]}>
                        <Ionicons name={p.icon as any} size={20} color="#fff" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <AppText variant="title">{p.label}</AppText>
                          {p.connected ? <Badge label={p.verified_at ? "Connected · checked" : "Connected"} tone="success" size="xs" /> : p.needs_reauth ? <Badge label="Reconnect" tone="warning" size="xs" /> : p.configured ? <Badge label="Keys added" tone="info" size="xs" /> : <Badge label="Not connected" tone="neutral" size="xs" />}
                        </View>
                        <AppText variant="caption" tone="secondary" numberOfLines={2}>
                          {p.display_name ? `Posting as ${p.display_name}` : p.connected ? "Ready to post" : p.auth === "oauth" ? (p.configured ? "Tap Connect and sign in as the Page admin" : `Needs ${p.missing_keys.join(", ")}`) : `Needs ${p.missing_keys.join(", ")}`}
                          {p.expires_at ? ` · expires ${new Date(p.expires_at).toLocaleDateString()}` : ""}
                        </AppText>
                        {p.last_error ? (
                          <AppText variant="micro" tone="error" numberOfLines={2}>
                            Last check: {p.last_error}
                          </AppText>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.toggleRow}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodySm">Auto-post newly verified listings</AppText>
                        <AppText variant="micro" tone="tertiary">{data.settings.auto_post[p.platform] ? (p.connected ? "On — posts go out when a listing is verified" : "On — posts wait here until connected") : "Off"}</AppText>
                      </View>
                      <Toggle label={`Auto-post to ${p.label}`} value={!!data.settings.auto_post[p.platform]} onChange={(v) => toggleAuto(p.platform, v)} disabled={busy === `auto-${p.platform}`} testID={`admin-social-auto-${p.platform}`} />
                    </View>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      {p.auth === "oauth" ? <Button label={p.connected ? "Reconnect" : "Connect"} size="sm" variant={p.connected ? "secondary" : "primary"} iconLeft="log-in-outline" onPress={() => connect(p)} loading={busy === `connect-${p.platform}`} disabled={!p.configured} testID={`admin-social-connect-${p.platform}`} /> : null}
                      <Button label="Test" size="sm" variant="secondary" iconLeft="pulse-outline" onPress={() => test(p)} loading={busy === `test-${p.platform}`} disabled={!p.configured} testID={`admin-social-test-${p.platform}`} />
                      <Button label="How to connect" size="sm" variant="ghost" iconLeft="help-circle-outline" onPress={() => setHelp(p.platform)} testID={`admin-social-help-${p.platform}`} />
                      {p.auth === "oauth" && (p.connected || p.needs_reauth) ? <Button label="Disconnect" size="sm" variant="ghost" iconLeft="unlink-outline" onPress={() => run(`dc-${p.platform}`, () => api.adminSocialDisconnect(p.platform), `${p.label} disconnected`)} disabled={!!busy} testID={`admin-social-disconnect-${p.platform}`} /> : null}
                    </View>
                  </View>
                </Card>
              ))}
            </View>

            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <AppText variant="label" tone="secondary" uppercase>
                  Recent posts
                </AppText>
                {data.stats.queued ? <Button label="Publish waiting" size="sm" variant="secondary" iconLeft="play" onPress={() => run("pq", () => api.adminSocialPublishQueued(), "Tried every waiting post")} loading={busy === "pq"} testID="admin-social-publish-queued" /> : null}
              </View>
              {data.recent.length === 0 ? (
                <EmptyState icon="paper-plane-outline" title="Nothing posted yet" body="Tap Post to pick a verified listing, preview the captions and publish to the connected accounts. Verified listings auto-post when the toggles above are on." actionLabel="Post a listing" onAction={() => router.push("/admin/social-compose" as any)} testID="admin-social-empty" />
              ) : (
                data.recent.map((p) => <PostCard key={p.id} post={p} onPress={() => setDetail(p)} />)
              )}
            </View>
          </>
        )}
      </ScrollView>

      <HelpSheet platform={data?.platforms.find((p) => p.platform === help) ?? null} onClose={() => setHelp(null)} />
      <PostDetailSheet post={detail} busy={busy} onClose={() => setDetail(null)} onRetry={(pl) => run(`retry-${detail?.id}`, async () => { const r = await api.adminSocialRetry(detail!.id, pl); setDetail(r); return r; })} onRefresh={() => run(`refresh-${detail?.id}`, async () => { const r = await api.adminSocialRefresh(detail!.id); setDetail(r); return r; })} onRemove={() => run(`rm-${detail?.id}`, async () => { await api.adminSocialDeletePost(detail!.id); setDetail(null); }, "Removed from history")} />
      {data ? <SettingsSheet visible={settingsOpen} settings={data.settings} onClose={() => setSettingsOpen(false)} onSaved={load} /> : null}
    </Screen>
  );
}

function PostCard({ post, onPress }: { post: PublishPost; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} elevation="xs" testID={`admin-social-post-${post.id}`}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>{post.image_url ? <Image source={{ uri: post.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="home-outline" size={18} color={colors.textTertiary} />}</View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {post.property_title ?? "Listing"}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {post.price_label} · {post.property_city} · {post.mode === "auto" ? "auto" : post.created_by_name ?? "manual"} · {when(post.created_at)}
          </AppText>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {post.platforms.map((pl) => {
              const r = post.results?.[pl];
              const tone = r?.status === "posted" ? "success" : r?.status === "failed" ? "error" : "warning";
              return <Badge key={pl} label={`${PLATFORM_LABELS[pl]} · ${r?.status === "queued" ? "waiting" : r?.status ?? "pending"}`} tone={tone as any} size="xs" />;
            })}
            {post.clicks ? <Badge label={`${post.clicks} open${post.clicks === 1 ? "" : "s"}`} tone="info" size="xs" /> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

function HelpSheet({ platform, onClose }: { platform: PublishPlatformStatus | null; onClose: () => void }) {
  const toast = useToast();
  const copy = async (t: string) => {
    await Clipboard.setStringAsync(t);
    toast.success("Copied");
  };
  return (
    <Sheet visible={!!platform} onClose={onClose} title={platform ? `Connect ${platform.label}` : ""} testID="admin-social-help-sheet">
      {platform ? (
        <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[3], paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <AppText variant="bodySm" tone="secondary">
            {platform.how}
          </AppText>
          <AppText variant="label" tone="secondary" uppercase>
            Keys to add (ask the AMASS agent to open the secure key card)
          </AppText>
          <View style={styles.chips}>
            {platform.keys.map((k) => (
              <Chip key={k} label={k} selected={!platform.missing_keys.includes(k)} onPress={() => copy(k)} />
            ))}
            {platform.optional_keys.map((k) => (
              <Chip key={k} label={`${k} (optional)`} selected={false} onPress={() => copy(k)} />
            ))}
          </View>
          {platform.redirect_uri ? (
            <Card tone="soft">
              <AppText variant="label" tone="secondary" uppercase>
                Redirect URL to register
              </AppText>
              <AppText variant="caption" selectable style={{ marginTop: 4 }}>
                {platform.redirect_uri}
              </AppText>
              <Button label="Copy URL" size="sm" variant="secondary" iconLeft="copy-outline" onPress={() => copy(platform.redirect_uri!)} style={{ marginTop: 8, alignSelf: "flex-start" }} testID="admin-social-help-copy-redirect" />
            </Card>
          ) : null}
          {platform.platform === "instagram" ? (
            <AppText variant="caption" tone="tertiary">
              Put the AMASS app link in the Instagram bio — captions say “link in bio” because Instagram doesn’t allow clickable links.
            </AppText>
          ) : null}
          {platform.platform === "tiktok" ? (
            <AppText variant="caption" tone="tertiary">
              Until TikTok approves the app in review, photo posts publish as private (Only me). Switch to Public in Settings once approved.
            </AppText>
          ) : null}
        </ScrollView>
      ) : (
        <View />
      )}
    </Sheet>
  );
}

function PostDetailSheet({ post, busy, onClose, onRetry, onRefresh, onRemove }: { post: PublishPost | null; busy: string | null; onClose: () => void; onRetry: (platform?: SocialPlatform) => void; onRefresh: () => void; onRemove: () => void }) {
  const toast = useToast();
  const failedOrQueued = post ? post.platforms.filter((pl) => post.results?.[pl]?.status !== "posted") : [];
  const copyCaption = async (t: string) => {
    await Clipboard.setStringAsync(t);
    toast.success("Caption copied");
  };
  return (
    <Sheet visible={!!post} onClose={onClose} title={post?.property_title ?? "Post"} testID="admin-social-post-sheet">
      {post ? (
        <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ gap: space[3], paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <AppText variant="caption" tone="secondary">
            {post.price_label} · {post.property_city} · {post.mode === "auto" ? "Auto-posted on verification" : `Posted by ${post.created_by_name ?? "admin"}`} · {when(post.created_at)}
            {post.clicks ? ` · ${post.clicks} app opens` : ""}
          </AppText>
          {post.platforms.map((pl) => {
            const r = post.results?.[pl];
            return (
              <Card key={pl} elevation="xs" testID={`admin-social-post-result-${pl}`}>
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.logoSm, { backgroundColor: PLATFORM_COLORS[pl] }]}>
                      <Ionicons name={(pl === "x" ? "logo-twitter" : `logo-${pl}`) as any} size={12} color="#fff" />
                    </View>
                    <AppText variant="bodyMedium" style={{ flex: 1 }}>
                      {PLATFORM_LABELS[pl]}
                    </AppText>
                    <Badge label={r?.status === "queued" ? "waiting" : r?.status ?? "pending"} tone={r?.status === "posted" ? "success" : r?.status === "failed" ? "error" : "warning"} size="xs" />
                  </View>
                  {r?.error ? (
                    <AppText variant="caption" tone={r.status === "queued" ? "secondary" : "error"}>
                      {r.status === "queued" ? `${r.error} — it goes out automatically when you connect it.` : r.error}
                    </AppText>
                  ) : null}
                  {r?.note ? (
                    <AppText variant="caption" tone="secondary">
                      {r.note}
                      {r.tiktok_status ? ` · ${r.tiktok_status}` : ""}
                    </AppText>
                  ) : null}
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {r?.url ? <Button label="Open post" size="sm" variant="secondary" iconLeft="open-outline" onPress={() => Linking.openURL(r.url!)} testID={`admin-social-post-open-${pl}`} /> : null}
                    {r?.status && r.status !== "posted" ? <Button label="Retry" size="sm" variant="primary" iconLeft="refresh" onPress={() => onRetry(pl)} loading={busy === `retry-${post.id}`} testID={`admin-social-post-retry-${pl}`} /> : null}
                    {r?.caption ? <Button label="Copy caption" size="sm" variant="ghost" iconLeft="copy-outline" onPress={() => copyCaption(r.caption!)} testID={`admin-social-post-copy-${pl}`} /> : null}
                  </View>
                </View>
              </Card>
            );
          })}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {failedOrQueued.length > 1 ? <Button label="Retry all" variant="primary" iconLeft="refresh" onPress={() => onRetry()} loading={busy === `retry-${post.id}`} testID="admin-social-post-retry-all" /> : null}
            {post.results?.tiktok?.status === "posted" ? <Button label="Check TikTok status" variant="secondary" iconLeft="pulse-outline" onPress={onRefresh} loading={busy === `refresh-${post.id}`} testID="admin-social-post-refresh" /> : null}
            {post.status === "queued" || post.status === "failed" ? <Button label="Remove" variant="ghost" iconLeft="trash-outline" onPress={onRemove} loading={busy === `rm-${post.id}`} testID="admin-social-post-remove" /> : null}
          </View>
        </ScrollView>
      ) : (
        <View />
      )}
    </Sheet>
  );
}

function SettingsSheet({ visible, settings, onClose, onSaved }: { visible: boolean; settings: PublishSettings; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const toast = useToast();
  const [hashtags, setHashtags] = useState("");
  const [ios, setIos] = useState("");
  const [android, setAndroid] = useState("");
  const [bio, setBio] = useState("");
  const [footer, setFooter] = useState("");
  const [tiktokPrivacy, setTiktokPrivacy] = useState("SELF_ONLY");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setHashtags(settings.hashtags.map((t) => `#${t}`).join(" "));
    setIos(settings.ios_store_url ?? "");
    setAndroid(settings.android_store_url ?? "");
    setBio(settings.instagram_bio_note ?? "");
    setFooter(settings.footer ?? "");
    setTiktokPrivacy(settings.tiktok_privacy ?? "SELF_ONLY");
  }, [visible, settings]);

  const tags = useMemo(() => hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, "").replace(/[^A-Za-z0-9_]/g, "")).filter(Boolean), [hashtags]);

  const save = async () => {
    for (const u of [ios, android]) if (u && !/^https:\/\//.test(u.trim())) return toast.error("Store links must start with https://");
    setBusy(true);
    try {
      await api.adminPublishSettings({ hashtags: tags, ios_store_url: ios.trim(), android_store_url: android.trim(), instagram_bio_note: bio.trim(), footer: footer.trim(), tiktok_privacy: tiktokPrivacy });
      toast.success("Settings saved");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error("Couldn't save", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={() => (busy ? null : onClose())} title="Posting settings" testID="admin-social-settings-sheet">
      <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ gap: space[4], paddingBottom: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Input label="Hashtags" value={hashtags} onChangeText={setHashtags} autoCapitalize="none" multiline helper={`${tags.length} tags · city and property-type tags are added automatically`} testID="admin-social-hashtags" />
        <Input label="App Store link (iOS)" value={ios} onChangeText={setIos} autoCapitalize="none" keyboardType="url" placeholder="https://apps.apple.com/…" helper="Where iPhone users without the app land. Leave empty until published — they get the web listing meanwhile." testID="admin-social-ios" />
        <Input label="Play Store link (Android)" value={android} onChangeText={setAndroid} autoCapitalize="none" keyboardType="url" placeholder="https://play.google.com/store/apps/details?id=com.amassafrica.app" testID="admin-social-android" />
        <Input label="Instagram ‘link in bio’ line" value={bio} onChangeText={setBio} testID="admin-social-bio" />
        <Input label="Caption footer" value={footer} onChangeText={setFooter} testID="admin-social-footer" />
        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="secondary">
            TikTok visibility
          </AppText>
          <View style={styles.chips}>
            {[
              ["SELF_ONLY", "Only me (unaudited apps)"],
              ["PUBLIC_TO_EVERYONE", "Public"],
              ["FOLLOWER_OF_CREATOR", "Followers"],
              ["MUTUAL_FOLLOW_FRIENDS", "Friends"],
            ].map(([v, l]) => (
              <Chip key={v} label={l} selected={tiktokPrivacy === v} onPress={() => setTiktokPrivacy(v)} testID={`admin-social-tiktok-${v}`} />
            ))}
          </View>
        </View>
        <Button label="Save settings" variant="primary" iconLeft="checkmark" onPress={save} loading={busy} testID="admin-social-settings-save" />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", gap: space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  logo: { width: 40, height: 40, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  logoSm: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  thumb: { width: 52, height: 52, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
