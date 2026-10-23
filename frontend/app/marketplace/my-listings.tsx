/**
 * My Listings — the seller side of Declutter.
 *  • Listings: everything I've posted (active / paused / sold) with views, saves, open offers
 *    and one-tap management (edit, pause/resume, mark sold, delete).
 *  • Offers in: buyers' offers on my items → accept / counter / decline → chat.
 *  • Offers out: offers I've sent → counter answers, withdraw, open chat.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { api, MarketOffer, MarketplaceItem, OfferStatus } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, IconButton, Input, Screen, ScreenHeader, SegmentedControl, Sheet, SkeletonRows, StatTile, useToast, type BadgeTone } from "@/src/ui";

type Tab = "listings" | "received" | "sent";

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Live", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  sold: { label: "Sold", tone: "neutral" },
};

const OFFER_META: Record<OfferStatus, { label: string; tone: BadgeTone }> = {
  sent: { label: "Awaiting reply", tone: "info" },
  countered: { label: "Countered", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  superseded: { label: "Replaced", tone: "neutral" },
};

function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = 60_000, h = 60 * m, d = 24 * h;
  if (diff < h) return `${Math.max(1, Math.round(diff / m))}m ago`;
  if (diff < d) return `${Math.round(diff / h)}h ago`;
  if (diff < 7 * d) return `${Math.round(diff / d)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function pctOff(amount: number, asking?: number | null) {
  if (!asking || asking <= 0) return null;
  const pct = Math.round(((asking - amount) / asking) * 100);
  if (pct === 0) return "Full asking price";
  return pct > 0 ? `${pct}% below asking` : `${Math.abs(pct)}% above asking`;
}

export default function MyListingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "received" || params.tab === "sent" ? params.tab : "listings");

  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [received, setReceived] = useState<MarketOffer[]>([]);
  const [sent, setSent] = useState<MarketOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [manage, setManage] = useState<MarketplaceItem | null>(null);
  const [edit, setEdit] = useState<MarketplaceItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MarketplaceItem | null>(null);
  const [counter, setCounter] = useState<MarketOffer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [l, r, s] = await Promise.all([api.marketplaceMyListings(), api.marketplaceOffersReceived(), api.marketplaceOffersSent()]);
      setItems(l);
      setReceived(r);
      setSent(s);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openOffersIn = useMemo(() => received.filter((o) => o.status === "sent" || o.status === "countered").length, [received]);
  const actionNeededOut = useMemo(() => sent.filter((o) => o.status === "countered").length, [sent]);
  const liveCount = items.filter((i) => (i.status ?? "active") === "active").length;
  const totalViews = items.reduce((a, i) => a + (i.views || 0), 0);

  const patchListing = async (item: MarketplaceItem, patch: Parameters<typeof api.marketplaceUpdateListing>[1], successMsg: string) => {
    setBusy(item.id);
    try {
      const r = await api.marketplaceUpdateListing(item.id, patch);
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...r.item } : x)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(successMsg);
      setManage(null);
      if (patch.status === "sold") load(); // offers were auto-closed server-side
    } catch (e: any) {
      toast.error("Couldn't update listing", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const deleteListing = async () => {
    if (!confirmDelete) return;
    setBusy(confirmDelete.id);
    try {
      await api.marketplaceDeleteListing(confirmDelete.id);
      setItems((prev) => prev.filter((x) => x.id !== confirmDelete.id));
      toast.success("Listing deleted");
      setConfirmDelete(null);
      setManage(null);
      load();
    } catch (e: any) {
      toast.error("Couldn't delete", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const respond = async (offer: MarketOffer, action: "accept" | "decline" | "counter", counterAmount?: number) => {
    setBusy(offer.id);
    try {
      const r = await api.marketplaceRespondOffer(offer.id, action, counterAmount);
      const upd = (list: MarketOffer[]) => list.map((o) => (o.id === offer.id ? { ...o, ...r.offer } : o));
      setReceived(upd);
      setSent(upd);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (action === "accept") {
        toast.show({
          kind: "success",
          title: "Offer accepted",
          body: "A chat has been opened so you can arrange pickup.",
          actionLabel: r.offer.conversation_id ? "Open chat" : undefined,
          onAction: r.offer.conversation_id ? () => router.push(`/chat/${r.offer.conversation_id}` as any) : undefined,
        });
      } else if (action === "counter") {
        toast.success(`Countered at ${formatNaira(counterAmount || 0)}`, "The buyer has been notified.");
      } else {
        toast.info("Offer declined");
      }
      setCounter(null);
      load();
    } catch (e: any) {
      toast.error("Couldn't respond", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (offer: MarketOffer) => {
    setBusy(offer.id);
    try {
      const r = await api.marketplaceWithdrawOffer(offer.id);
      setSent((prev) => prev.map((o) => (o.id === offer.id ? { ...o, ...r.offer } : o)));
      toast.info("Offer withdrawn");
    } catch (e: any) {
      toast.error("Couldn't withdraw", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const segOptions = [
    { value: "listings" as Tab, label: items.length ? `Listings · ${items.length}` : "Listings" },
    { value: "received" as Tab, label: openOffersIn ? `Offers in · ${openOffersIn}` : "Offers in" },
    { value: "sent" as Tab, label: actionNeededOut ? `Offers out · ${actionNeededOut}` : "Offers out" },
  ];

  return (
    <Screen testID="my-listings-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="My listings"
        subtitle="Declutter · Offers · Sales"
        right={<IconButton icon="add" label="Sell an item" onPress={() => router.push("/marketplace/sell" as any)} testID="my-listings-sell" />}
      />
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <SegmentedControl options={segOptions} value={tab} onChange={setTab} testIDPrefix="my-listings-tab" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60 + insets.bottom, gap: space[3] }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        {loading ? (
          <Card>
            <SkeletonRows rows={6} />
          </Card>
        ) : error ? (
          <EmptyState variant="error" title="Couldn't load your listings" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} testID="my-listings-error" />
        ) : tab === "listings" ? (
          <>
            {items.length > 0 ? (
              <View style={styles.statsRow}>
                <StatTile icon="pricetags" tone="success" value={liveCount} label="Live" />
                <StatTile icon="eye" tone="info" value={totalViews} label="Views" />
                <StatTile icon="chatbubbles" tone="mass" value={openOffersIn} label="Open offers" onPress={() => setTab("received")} />
              </View>
            ) : null}
            {items.length === 0 ? (
              <EmptyState icon="storefront-outline" title="Nothing listed yet" body="Declutter your home — snap a photo, set a price and buyers nearby will find it." actionLabel="Sell an item" onAction={() => router.push("/marketplace/sell" as any)} testID="my-listings-empty" />
            ) : (
              items.map((it) => <ListingRow key={it.id} item={it} onPress={() => router.push(`/marketplace/${it.id}` as any)} onManage={() => setManage(it)} />)
            )}
          </>
        ) : tab === "received" ? (
          received.length === 0 ? (
            <EmptyState icon="mail-open-outline" title="No offers yet" body="When a buyer makes an offer on one of your items it shows up here — accept, counter or decline in one tap." testID="offers-in-empty" />
          ) : (
            received.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                role="seller"
                busy={busy === o.id}
                onOpenItem={() => o.item && router.push(`/marketplace/${o.item.id}` as any)}
                onAccept={() => respond(o, "accept")}
                onDecline={() => respond(o, "decline")}
                onCounter={() => setCounter(o)}
                onChat={() => o.conversation_id && router.push(`/chat/${o.conversation_id}` as any)}
              />
            ))
          )
        ) : sent.length === 0 ? (
          <EmptyState icon="paper-plane-outline" title="You haven't made any offers" body="Found something you like in Declutter? Tap “Make an offer” on the listing — sellers usually reply within a day." actionLabel="Browse Declutter" onAction={() => router.push("/(tabs)/marketplace" as any)} testID="offers-out-empty" />
        ) : (
          sent.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              role="buyer"
              busy={busy === o.id}
              onOpenItem={() => o.item && router.push(`/marketplace/${o.item.id}` as any)}
              onAccept={() => respond(o, "accept")}
              onDecline={() => respond(o, "decline")}
              onWithdraw={() => withdraw(o)}
              onChat={() => o.conversation_id && router.push(`/chat/${o.conversation_id}` as any)}
            />
          ))
        )}
      </ScrollView>

      {/* Manage sheet */}
      <Sheet visible={!!manage} onClose={() => setManage(null)} title={manage?.name ?? "Manage listing"} testID="manage-sheet">
        {manage ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Badge label={STATUS_META[manage.status ?? "active"]?.label ?? "Live"} tone={STATUS_META[manage.status ?? "active"]?.tone ?? "success"} />
              <AppText variant="caption" tone="tertiary" tabular>
                {formatNaira(manage.price)} · {manage.views || 0} views · {manage.saves || 0} saves
              </AppText>
            </View>
            <Button label="View listing" variant="secondary" iconLeft="eye-outline" fullWidth onPress={() => { setManage(null); router.push(`/marketplace/${manage.id}` as any); }} testID="manage-view" />
            <Button label="Edit price & details" variant="secondary" iconLeft="create-outline" fullWidth onPress={() => { setEdit(manage); setManage(null); }} testID="manage-edit" />
            {(manage.status ?? "active") !== "sold" ? (
              <Button label="Mark as sold" iconLeft="checkmark-done" fullWidth loading={busy === manage.id} onPress={() => patchListing(manage, { status: "sold" }, "Marked as sold · open offers closed")} testID="manage-sold" />
            ) : (
              <Button label="Relist as available" iconLeft="refresh" fullWidth loading={busy === manage.id} onPress={() => patchListing(manage, { status: "active" }, "Listing is live again")} testID="manage-relist" />
            )}
            {(manage.status ?? "active") === "active" ? (
              <Button label="Pause listing" variant="outline" iconLeft="pause" fullWidth loading={busy === manage.id} onPress={() => patchListing(manage, { status: "paused" }, "Listing paused · hidden from buyers")} testID="manage-pause" />
            ) : manage.status === "paused" ? (
              <Button label="Resume listing" variant="outline" iconLeft="play" fullWidth loading={busy === manage.id} onPress={() => patchListing(manage, { status: "active" }, "Listing resumed")} testID="manage-resume" />
            ) : null}
            <Button label="Delete listing" variant="destructive" iconLeft="trash-outline" fullWidth onPress={() => { setConfirmDelete(manage); setManage(null); }} testID="manage-delete" />
          </View>
        ) : null}
      </Sheet>

      <EditListingSheet item={edit} onClose={() => setEdit(null)} onSaved={(updated) => { setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))); setEdit(null); }} />

      {/* Delete confirm */}
      <Sheet visible={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete this listing?" testID="delete-sheet">
        <View style={{ gap: 12 }}>
          <AppText variant="bodySm" tone="secondary">
            “{confirmDelete?.name}” will be removed for everyone and any open offers will be closed. This can’t be undone.
          </AppText>
          <Button label="Delete listing" variant="destructive" fullWidth loading={!!confirmDelete && busy === confirmDelete.id} onPress={deleteListing} testID="delete-confirm" />
          <Button label="Keep it" variant="ghost" fullWidth onPress={() => setConfirmDelete(null)} />
        </View>
      </Sheet>

      <CounterSheet offer={counter} busy={!!counter && busy === counter.id} onClose={() => setCounter(null)} onSubmit={(amt) => counter && respond(counter, "counter", amt)} />
    </Screen>
  );
}

function ListingRow({ item, onPress, onManage }: { item: MarketplaceItem; onPress: () => void; onManage: () => void }) {
  const { colors } = useTheme();
  const status = item.status ?? "active";
  const meta = STATUS_META[status] ?? STATUS_META.active;
  return (
    <Card elevation="xs" testID={`my-listing-${item.id}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={onPress} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }} accessibilityRole="button" accessibilityLabel={`Open ${item.name}`}>
          <View style={[styles.thumbWrap, { backgroundColor: colors.surfaceAlt }]}>
            <Image source={{ uri: item.image }} style={[styles.thumb, status !== "active" && { opacity: 0.55 }]} contentFit="cover" transition={150} />
            {status === "sold" ? (
              <View style={[styles.soldTag, { backgroundColor: colors.text }]}>
                <AppText variant="micro" color={colors.bg} weight="bold">
                  SOLD
                </AppText>
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <AppText variant="title" numberOfLines={1}>
              {item.name}
            </AppText>
            <AppText variant="bodyMedium" tabular>
              {formatNaira(item.price)}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Badge label={meta.label} tone={meta.tone} size="xs" />
              <AppText variant="micro" tone="tertiary" tabular>
                {item.views || 0} views · {item.saves || 0} saves · {timeAgo(item.posted_at)}
              </AppText>
            </View>
            {item.open_offers ? <Badge label={`${item.open_offers} open offer${item.open_offers === 1 ? "" : "s"}`} tone="mass" icon="chatbubble-ellipses" size="xs" /> : null}
          </View>
        </Pressable>
        <IconButton icon="ellipsis-horizontal" label={`Manage ${item.name}`} onPress={onManage} testID={`manage-${item.id}`} />
      </View>
    </Card>
  );
}

function OfferCard({ offer, role, busy, onOpenItem, onAccept, onDecline, onCounter, onWithdraw, onChat }: {
  offer: MarketOffer;
  role: "seller" | "buyer";
  busy: boolean;
  onOpenItem: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCounter?: () => void;
  onWithdraw?: () => void;
  onChat: () => void;
}) {
  const { colors } = useTheme();
  const meta = OFFER_META[offer.status] ?? OFFER_META.sent;
  const asking = offer.asking_price ?? offer.item?.price;
  const live = offer.status === "sent" || offer.status === "countered";
  const headline = offer.status === "accepted" ? offer.agreed_amount ?? offer.counter_amount ?? offer.amount : offer.amount;

  return (
    <Card elevation="xs" testID={`offer-${offer.id}`}>
      <View style={{ gap: 12 }}>
        <Pressable onPress={onOpenItem} style={{ flexDirection: "row", alignItems: "center", gap: 12 }} accessibilityRole="button" accessibilityLabel={`View ${offer.item?.name ?? "listing"}`}>
          <View style={[styles.thumbWrapSm, { backgroundColor: colors.surfaceAlt }]}>
            {offer.item?.image ? <Image source={{ uri: offer.item.image }} style={styles.thumb} contentFit="cover" /> : <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="caption" tone="tertiary" numberOfLines={1}>
              {role === "seller" ? `${offer.buyer_name || "A buyer"} · ${timeAgo(offer.created_at)}` : `To ${offer.item?.seller_name || "seller"} · ${timeAgo(offer.created_at)}`}
            </AppText>
            <AppText variant="bodyMedium" numberOfLines={1}>
              {offer.item?.name ?? "Listing unavailable"}
            </AppText>
            {asking ? (
              <AppText variant="micro" tone="tertiary" tabular>
                Asking {formatNaira(asking)}
              </AppText>
            ) : null}
          </View>
          <Badge label={meta.label} tone={meta.tone} size="xs" />
        </Pressable>

        <View style={[styles.amountRow, { backgroundColor: colors.surfaceAlt }]}>
          <View style={{ flex: 1 }}>
            <AppText variant="label" tone="tertiary" uppercase>
              {offer.status === "accepted" ? "Agreed price" : role === "seller" ? "Their offer" : "Your offer"}
            </AppText>
            <AppText variant="h2" tabular>
              {formatNaira(headline)}
            </AppText>
            {offer.status !== "accepted" && pctOff(offer.amount, asking) ? (
              <AppText variant="micro" tone="secondary">
                {pctOff(offer.amount, asking)}
              </AppText>
            ) : null}
          </View>
          {offer.status === "countered" && offer.counter_amount ? (
            <View style={{ alignItems: "flex-end" }}>
              <AppText variant="label" tone="tertiary" uppercase>
                {role === "seller" ? "Your counter" : "Seller counter"}
              </AppText>
              <AppText variant="h3" tabular color={colors.warning}>
                {formatNaira(offer.counter_amount)}
              </AppText>
            </View>
          ) : null}
        </View>

        {offer.message ? (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.textTertiary} style={{ marginTop: 2 }} />
            <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }} numberOfLines={3}>
              “{offer.message}”
            </AppText>
          </View>
        ) : null}
        {offer.closed_reason === "item_sold" ? (
          <AppText variant="caption" tone="tertiary">
            Closed — the item was sold.
          </AppText>
        ) : null}

        {/* Actions */}
        {role === "seller" && live ? (
          <View style={styles.actions}>
            <Button label="Decline" variant="outline" size="sm" onPress={onDecline} disabled={busy} testID={`offer-decline-${offer.id}`} style={{ flex: 1 }} />
            {offer.status === "sent" && onCounter ? <Button label="Counter" variant="secondary" size="sm" iconLeft="swap-horizontal" onPress={onCounter} disabled={busy} testID={`offer-counter-${offer.id}`} style={{ flex: 1 }} /> : null}
            <Button label="Accept" size="sm" iconLeft="checkmark" onPress={onAccept} loading={busy} testID={`offer-accept-${offer.id}`} style={{ flex: 1.1 }} />
          </View>
        ) : role === "buyer" && offer.status === "countered" ? (
          <View style={styles.actions}>
            <Button label="Withdraw" variant="ghost" size="sm" onPress={onWithdraw} disabled={busy} testID={`offer-withdraw-${offer.id}`} />
            <Button label="Decline" variant="outline" size="sm" onPress={onDecline} disabled={busy} testID={`offer-decline-${offer.id}`} style={{ flex: 1 }} />
            <Button label={`Accept ${formatNaira(offer.counter_amount || 0)}`} size="sm" iconLeft="checkmark" onPress={onAccept} loading={busy} testID={`offer-accept-${offer.id}`} style={{ flex: 1.4 }} />
          </View>
        ) : role === "buyer" && offer.status === "sent" ? (
          <View style={styles.actions}>
            <Button label="Withdraw offer" variant="outline" size="sm" iconLeft="close" onPress={onWithdraw} loading={busy} testID={`offer-withdraw-${offer.id}`} style={{ flex: 1 }} />
          </View>
        ) : offer.status === "accepted" ? (
          <Button label={role === "seller" ? "Chat with buyer to arrange pickup" : "Chat with seller to arrange pickup"} size="sm" variant="primary" iconLeft="chatbubble-ellipses" fullWidth onPress={onChat} disabled={!offer.conversation_id} testID={`offer-chat-${offer.id}`} />
        ) : role === "buyer" && offer.status === "declined" && offer.item?.status !== "sold" ? (
          <Button label="Make a new offer" size="sm" variant="secondary" iconLeft="pricetag" fullWidth onPress={onOpenItem} testID={`offer-again-${offer.id}`} />
        ) : null}
      </View>
    </Card>
  );
}

function EditListingSheet({ item, onClose, onSaved }: { item: MarketplaceItem | null; onClose: () => void; onSaved: (it: MarketplaceItem) => void }) {
  const toast = useToast();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [negotiable, setNegotiable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setPrice(String(item.price));
      setDescription(item.description);
      setNegotiable(item.negotiable !== false);
      setErr(null);
    }
  }, [item]);

  const save = async () => {
    if (!item) return;
    const p = parseInt(price.replace(/\D/g, ""), 10);
    if (!p || p <= 0) {
      setErr("Enter a valid price");
      return;
    }
    if (name.trim().length < 3) {
      setErr("Title must be at least 3 characters");
      return;
    }
    if (description.trim().length < 10) {
      setErr("Description must be at least 10 characters");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const patch: Record<string, any> = {};
      if (name.trim() !== item.name) patch.name = name.trim();
      if (p !== item.price) patch.price = p;
      if (description.trim() !== item.description) patch.description = description.trim();
      if (negotiable !== (item.negotiable !== false)) patch.negotiable = negotiable;
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      const r = await api.marketplaceUpdateListing(item.id, patch);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Listing updated");
      onSaved(r.item);
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={!!item} onClose={onClose} title="Edit listing" testID="edit-sheet">
      <View style={{ gap: 12 }}>
        <Input label="Title" value={name} onChangeText={setName} maxLength={140} testID="edit-name" />
        <Input label="Price (₦)" value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" iconLeft="cash-outline" testID="edit-price" />
        <Input label="Description" value={description} onChangeText={setDescription} multiline numberOfLines={4} maxLength={2000} style={{ minHeight: 96, textAlignVertical: "top" }} testID="edit-description" />
        <Pressable onPress={() => setNegotiable((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }} accessibilityRole="checkbox" accessibilityState={{ checked: negotiable }} testID="edit-negotiable">
          <Ionicons name={negotiable ? "checkbox" : "square-outline"} size={22} color={negotiable ? colors.success : colors.textMuted} />
          <AppText variant="bodySm">Open to offers (negotiable)</AppText>
        </Pressable>
        {err ? (
          <AppText variant="caption" tone="error" testID="edit-error">
            {err}
          </AppText>
        ) : null}
        <Button label="Save changes" size="lg" fullWidth loading={saving} onPress={save} testID="edit-save" />
      </View>
    </Sheet>
  );
}

function CounterSheet({ offer, busy, onClose, onSubmit }: { offer: MarketOffer | null; busy: boolean; onClose: () => void; onSubmit: (amount: number) => void }) {
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (offer) {
      const asking = offer.asking_price ?? offer.item?.price ?? offer.amount;
      setAmount(String(Math.round((offer.amount + asking) / 2)));
    }
  }, [offer]);
  const n = parseInt(amount.replace(/\D/g, ""), 10) || 0;
  const asking = offer?.asking_price ?? offer?.item?.price;
  return (
    <Sheet visible={!!offer} onClose={onClose} title="Counter-offer" testID="counter-sheet">
      {offer ? (
        <View style={{ gap: 12 }}>
          <AppText variant="bodySm" tone="secondary">
            {offer.buyer_name || "The buyer"} offered {formatNaira(offer.amount)}
            {asking ? ` on your ${formatNaira(asking)} listing` : ""}. Suggest a price you’d accept.
          </AppText>
          <Input label="Your counter (₦)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" iconLeft="swap-horizontal" autoFocus testID="counter-amount" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {asking
              ? [0.95, 0.9, 0.85].map((f) => (
                  <Button key={f} label={formatNaira(Math.round(asking * f))} variant="secondary" size="sm" onPress={() => setAmount(String(Math.round(asking * f)))} style={{ flex: 1 }} />
                ))
              : null}
          </View>
          <Button label={n > 0 ? `Send counter · ${formatNaira(n)}` : "Send counter"} size="lg" fullWidth disabled={n <= 0 || n === offer.amount} loading={busy} onPress={() => onSubmit(n)} testID="counter-submit" />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: "row", gap: space[3] },
  thumbWrap: { width: 72, height: 72, borderRadius: radii.md, overflow: "hidden" },
  thumbWrapSm: { width: 48, height: 48, borderRadius: radii.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  thumb: { width: "100%", height: "100%" },
  soldTag: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingVertical: 2 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
});
