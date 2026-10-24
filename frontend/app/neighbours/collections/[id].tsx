/**
 * Collection detail — the "decide together" screen.
 * Each home keeps its normal card + a prominent "View & unlock" button that lands on the
 * property's existing paid action (attributed as via=collection:<id>). Members react
 * (love / maybe / no) and discuss; nothing here reveals paid information.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Share, TextInput, Platform } from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { api, CollectionDetail, CollectionItem, Connection } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useAuth } from "@/src/contexts/auth";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Sheet, SkeletonCard, useToast } from "@/src/ui";
import { ListingCard } from "@/src/components/ListingCard";
import { RetailerRow } from "@/src/components/shop/RetailerCards";
import { priceLabel } from "@/src/components/shop/shopFormat";
import { timeAgo } from "@/src/components/neighbours/PostRow";

const ORIGIN = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [c, setC] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState<"forbidden" | "other" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState<Connection[] | null>(null);
  const [comment, setComment] = useState("");
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setC(await api.collection(id));
    } catch (e: any) {
      setError(e?.status === 403 || e?.status === 404 ? "forbidden" : "other");
    } finally {
      setRefreshing(false);
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => {
    if (inviteOpen && friends === null) api.socialConnections().then((r) => setFriends(r.accepted)).catch(() => setFriends([]));
  }, [inviteOpen, friends]);

  const react = async (item: CollectionItem, r: "love" | "maybe" | "no") => {
    if (!c) return;
    const next = item.reactions.mine === r ? "clear" : r;
    Haptics.selectionAsync().catch(() => {});
    setC({
      ...c,
      items: c.items.map((it) => {
        if (it.id !== item.id) return it;
        const rx = { ...it.reactions };
        if (it.reactions.mine) rx[it.reactions.mine] = Math.max(0, rx[it.reactions.mine] - 1);
        if (next !== "clear") rx[r] += 1;
        rx.mine = next === "clear" ? null : r;
        return { ...it, reactions: rx };
      }),
    });
    try {
      await api.collectionReact(c.id, item.id, next);
    } catch {
      load();
    }
  };

  const send = async () => {
    if (!c || comment.trim().length === 0) return;
    setSending(true);
    try {
      const cm = await api.collectionComment(c.id, comment.trim(), commentFor ?? undefined);
      setC({ ...c, comments: [...c.comments, cm], items: c.items.map((it) => (it.id === commentFor ? { ...it, comment_count: it.comment_count + 1 } : it)) });
      setComment("");
      setCommentFor(null);
    } catch (e: any) {
      toast.error("Couldn't send", e?.message);
    } finally {
      setSending(false);
    }
  };

  const invite = async (uid: string) => {
    if (!c) return;
    try {
      const r = await api.collectionInvite(c.id, uid);
      track("collection_invite");
      toast.success(r.already_member ? "Already a member" : "Invited", r.already_member ? undefined : "They've been notified.");
      setInviteOpen(false);
      load();
    } catch (e: any) {
      toast.error("Couldn't invite", e?.message);
    }
  };

  const shareLink = async () => {
    if (!c?.invite_code) return;
    const url = `${ORIGIN}/neighbours/collections/join/${c.invite_code}`;
    track("collection_invite", { via: "link" });
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(url);
        toast.success("Invite link copied", "Anyone with the link can join this list after signing in.");
      } else {
        await Share.share({ message: `Join my AMASS list “${c.name}”: ${url}` });
      }
    } catch {
      /* dismissed */
    }
  };

  const remove = async (item: CollectionItem) => {
    if (!c) return;
    try {
      await api.collectionRemoveItem(c.id, item.id);
      setC({ ...c, items: c.items.filter((i) => i.id !== item.id), item_count: c.item_count - 1 });
      toast.info("Removed from list");
    } catch (e: any) {
      toast.error("Couldn't remove", e?.message);
    }
  };

  const leaveOrDelete = async () => {
    if (!c) return;
    try {
      const r = await api.collectionDelete(c.id);
      toast.success(r.deleted ? "List deleted" : "You left the list");
      router.back();
    } catch (e: any) {
      toast.error("Couldn't do that", e?.message);
    }
  };

  if (error) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Shared list" />
        <EmptyState icon={error === "forbidden" ? "lock-closed-outline" : "cloud-offline-outline"} variant={error === "forbidden" ? "empty" : "error"} title={error === "forbidden" ? "This list is private" : "Couldn't load list"} body={error === "forbidden" ? "Only people invited by the owner can see it. Ask them for an invite link." : "Check your connection and try again."} actionLabel={error === "forbidden" ? "Back to my lists" : "Retry"} onAction={error === "forbidden" ? () => router.replace("/neighbours/collections" as any) : load} testID="collection-forbidden" />
      </Screen>
    );
  }

  const generalComments = c?.comments.filter((cm) => !cm.item_id) ?? [];

  return (
    <Screen testID="collection-detail-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={c ? `${c.emoji ?? ""} ${c.name}`.trim() : "Shared list"}
        subtitle={c ? `${c.item_count} saved · ${c.member_count === 1 ? "just you" : `${c.member_count} people`}` : undefined}
        right={
          <View style={{ flexDirection: "row", gap: 4 }}>
            <IconButton icon="people-outline" label="Members" onPress={() => setMembersOpen(true)} testID="collection-members" />
            <IconButton icon="person-add-outline" label="Invite" onPress={() => setInviteOpen(true)} testID="collection-invite" />
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 140, gap: space[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} keyboardShouldPersistTaps="handled">
        {!c ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            {c.member_count === 1 ? (
              <Card elevation="none" style={{ backgroundColor: colors.brandSoft, borderColor: "transparent" }} testID="collection-invite-nudge">
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <Ionicons name="heart-circle" size={30} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium">Decide together</AppText>
                    <AppText variant="caption" tone="secondary">
                      Invite your partner or a friend — they can react and comment on every home.
                    </AppText>
                  </View>
                  <Button label="Invite" size="sm" onPress={() => setInviteOpen(true)} />
                </View>
              </Card>
            ) : null}

            {c.items.length === 0 ? (
              c.kind === "shopping" ? (
                <EmptyState icon="cart-outline" title="Nothing on this list yet" body="Add products or stores from the Shop — everyone on the list can react and comment before you buy." actionLabel="Browse the Shop" onAction={() => router.push("/(tabs)/marketplace" as any)} testID="collection-empty" />
              ) : (
                <EmptyState icon={c.kind === "homes" ? "home-outline" : "location-outline"} title={c.kind === "homes" ? "No homes saved yet" : "No places saved yet"} body={c.kind === "homes" ? "Tap “Add to list” on any property, or browse the map and save homes here." : "Save useful places from the Local map."} actionLabel={c.kind === "homes" ? "Browse homes" : "Open Local map"} onAction={() => router.push((c.kind === "homes" ? "/(tabs)" : "/neighbours/places") as any)} testID="collection-empty" />
              )
            ) : (
              c.items.map((item) => <ItemBlock key={item.id} item={item} collectionId={c.id} me={user?.id} isOwner={c.is_owner} onReact={(r) => react(item, r)} onComment={() => { setCommentFor(item.id); inputRef.current?.focus(); }} onRemove={() => remove(item)} comments={c.comments.filter((cm) => cm.item_id === item.id)} />)
            )}

            {/* Discussion */}
            <View style={{ gap: 8 }}>
              <AppText variant="label" tone="tertiary" uppercase>
                Discussion
              </AppText>
              {generalComments.length === 0 ? (
                <AppText variant="caption" tone="tertiary">
                  No messages yet. Say what matters most — budget, commute, schools…
                </AppText>
              ) : (
                generalComments.map((cm) => <CommentRow key={cm.id} cm={cm} mine={cm.user_id === user?.id} />)
              )}
            </View>
            <Button label={c.is_owner ? "Delete list" : "Leave list"} variant="ghost" size="sm" iconLeft={c.is_owner ? "trash-outline" : "exit-outline"} onPress={leaveOrDelete} style={{ alignSelf: "center" }} testID="collection-leave" />
          </>
        )}
      </ScrollView>

      {c ? (
        <View style={[styles.composer, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
          {commentFor ? (
            <Pressable onPress={() => setCommentFor(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }} accessibilityRole="button" accessibilityLabel="Cancel replying to home">
              <Ionicons name="return-down-forward" size={14} color={colors.textTertiary} />
              <AppText variant="micro" tone="tertiary">
                Commenting on {(() => { const it = c.items.find((i) => i.id === commentFor); return it?.property?.title ?? it?.product?.name ?? it?.store?.name ?? it?.place?.name ?? "an item"; })()} · tap to cancel
              </AppText>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput ref={inputRef} value={comment} onChangeText={setComment} placeholder="Add a comment…" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} maxLength={600} onSubmitEditing={send} returnKeyType="send" testID="collection-comment-input" />
            <IconButton icon="arrow-up" label="Send" variant="primary" onPress={send} disabled={!comment.trim() || sending} testID="collection-comment-send" />
          </View>
        </View>
      ) : null}

      <Sheet visible={membersOpen} onClose={() => setMembersOpen(false)} title="Members" testID="members-sheet">
        <View style={{ gap: 8 }}>
          {c?.members.map((m) => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar name={m.full_name} uri={m.avatar_url} size={36} tone="soft" />
              <AppText variant="bodyMedium" style={{ flex: 1 }}>
                {m.full_name}
                {m.id === c.owner_id ? "  · owner" : ""}
              </AppText>
              {c.is_owner && m.id !== c.owner_id ? <Button label="Remove" size="xs" variant="ghost" onPress={() => api.collectionRemoveMember(c.id, m.id).then(() => { setMembersOpen(false); load(); })} /> : null}
            </View>
          ))}
        </View>
      </Sheet>

      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite to this list" testID="invite-sheet">
        <View style={{ gap: 10 }}>
          {friends === null ? null : friends.length === 0 ? (
            <AppText variant="bodySm" tone="secondary">
              You’re not connected with anyone yet. Share the invite link instead, or find friends first.
            </AppText>
          ) : (
            friends
              .filter((f) => !c?.members.some((m) => m.id === f.user.id))
              .map((f) => (
                <Pressable key={f.id} onPress={() => invite(f.user.id)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }} accessibilityRole="button" testID={`invite-${f.user.id}`}>
                  <Avatar name={f.user.full_name} uri={f.user.avatar_url} size={36} tone="soft" />
                  <AppText variant="bodyMedium" style={{ flex: 1 }}>
                    {f.user.full_name}
                  </AppText>
                  <Ionicons name="add-circle-outline" size={22} color={colors.text} />
                </Pressable>
              ))
          )}
          {c?.invite_code ? <Button label={Platform.OS === "web" ? "Copy invite link" : "Share invite link"} variant="secondary" iconLeft="link-outline" fullWidth onPress={shareLink} testID="invite-link" /> : null}
          <Button label="Find friends" variant="ghost" fullWidth onPress={() => { setInviteOpen(false); router.push("/neighbours/find-friends" as any); }} />
        </View>
      </Sheet>
    </Screen>
  );
}

function ItemBlock({ item, collectionId, me, isOwner, onReact, onComment, onRemove, comments }: { item: CollectionItem; collectionId: string; me?: string; isOwner: boolean; onReact: (r: "love" | "maybe" | "no") => void; onComment: () => void; onRemove: () => void; comments: CollectionDetail["comments"] }) {
  const router = useRouter();
  const { colors } = useTheme();
  const p = item.property;
  const place = item.place;
  const product = item.product;
  const store = item.store;
  const canRemove = isOwner || item.added_by?.id === me;
  const R = ({ k, icon, label, tone }: { k: "love" | "maybe" | "no"; icon: any; label: string; tone: string }) => {
    const active = item.reactions.mine === k;
    return (
      <Pressable onPress={() => onReact(k)} style={[styles.react, { backgroundColor: active ? tone : colors.surface, borderColor: active ? tone : colors.border }]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${label} ${item.reactions[k]}`} testID={`react-${k}-${item.id}`}>
        <Ionicons name={icon} size={15} color={active ? "#fff" : colors.textSecondary} />
        <AppText variant="micro" weight="bold" color={active ? "#fff" : colors.textSecondary} tabular>
          {item.reactions[k]}
        </AppText>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 8 }} testID={`collection-item-${item.id}`}>
      {p ? (
        <ListingCard property={p} width="100%" via={`collection:${collectionId}`} testID={`collection-listing-${p.id}`} />
      ) : place ? (
        <Pressable onPress={() => router.push(`/neighbours/places?focus=${place.id}` as any)} style={[styles.placeCard, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button">
          <Ionicons name="location" size={20} color={colors.info} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyMedium">{place.name}</AppText>
            <AppText variant="micro" tone="tertiary">
              {place.category} · {place.recommendation_count} recommendation{place.recommendation_count === 1 ? "" : "s"}
            </AppText>
          </View>
        </Pressable>
      ) : product ? (
        <Pressable onPress={() => router.push(`/shop/product/${product.id}` as any)} style={[styles.placeCard, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={product.name} testID={`collection-product-${product.id}`}>
          <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
            {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="contain" accessibilityIgnoresInvertColors /> : <Ionicons name="image-outline" size={22} color={colors.textMuted} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyMedium" numberOfLines={2}>{product.name}</AppText>
            <AppText variant="title" tabular>{priceLabel(product.price).prefix ? `${priceLabel(product.price).prefix} ` : ""}{priceLabel(product.price).main}</AppText>
            <AppText variant="micro" tone="tertiary" numberOfLines={1}>
              {[product.retailer?.short_name, product.brand].filter(Boolean).join(" · ")}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable>
      ) : store ? (
        <RetailerRow r={store} testID={`collection-store-${store.id}`} />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <R k="love" icon="heart" label="Love it" tone={colors.brand} />
        <R k="maybe" icon="help" label="Maybe" tone={colors.warning} />
        <R k="no" icon="close" label="Not for us" tone={colors.textSecondary} />
        <Pressable onPress={onComment} style={[styles.react, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Comment" testID={`comment-${item.id}`}>
          <Ionicons name="chatbubble-outline" size={15} color={colors.textSecondary} />
          <AppText variant="micro" weight="bold" tone="secondary" tabular>
            {item.comment_count}
          </AppText>
        </Pressable>
        <View style={{ flex: 1 }} />
        {canRemove ? <IconButton icon="trash-outline" label="Remove from list" size={32} iconSize={16} variant="ghost" onPress={onRemove} testID={`remove-${item.id}`} /> : null}
      </View>
      {p ? (
        <Button
          label={p.unlocked ? "View details" : p.token_cost === 0 ? "View & contact · Free" : `View & unlock · ${p.token_cost} MASS`}
          variant={p.unlocked ? "secondary" : "brand"}
          size="md"
          fullWidth
          iconLeft={p.unlocked ? "eye-outline" : "lock-open-outline"}
          onPress={() => {
            track("property_detail_view", { property_id: p.id, arrived_via: "collection" });
            router.push(`/property/${p.id}?via=collection:${collectionId}` as any);
          }}
          testID={`unlock-${p.id}`}
        />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {item.added_by ? (
          <AppText variant="micro" tone="tertiary">
            Added by {item.added_by.full_name.split(" ")[0]} · {timeAgo(item.created_at)}
          </AppText>
        ) : null}
        {item.note ? <Badge label={item.note} tone="neutral" size="xs" /> : null}
        {p && !p.unlocked && (p.token_cost ?? 0) > 0 ? <AppText variant="micro" tone="tertiary">· {formatNaira(p.price)}</AppText> : null}
      </View>
      {comments.map((cm) => (
        <CommentRow key={cm.id} cm={cm} mine={cm.user_id === me} indent />
      ))}
    </View>
  );
}

function CommentRow({ cm, mine, indent }: { cm: CollectionDetail["comments"][number]; mine: boolean; indent?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[{ flexDirection: "row", gap: 8, alignItems: "flex-start" }, indent && { paddingLeft: 8 }]} testID={`comment-row-${cm.id}`}>
      <Avatar name={cm.user?.full_name} uri={cm.user?.avatar_url} size={26} tone="soft" />
      <View style={[styles.bubble, { backgroundColor: mine ? colors.brandSoft : colors.surfaceAlt }]}>
        <AppText variant="micro" tone="tertiary">
          {mine ? "You" : cm.user?.full_name ?? "Member"} · {timeAgo(cm.created_at)}
        </AppText>
        <AppText variant="bodySm">{cm.text}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  react: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 32, borderRadius: radii.pill, borderWidth: 1 },
  placeCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  thumb: { width: 72, height: 72, borderRadius: radii.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  composer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 24, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, height: 44, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 14, fontSize: 17 },
  bubble: { flex: 1, padding: 10, borderRadius: radii.md, gap: 2 },
});
