/**
 * /viewings/[id] — one viewing: when, where, who, what's needed from me. Agents confirm / suggest another time /
 * decline / mark done; buyers confirm a suggested time, suggest another, or cancel. Both can open the chat.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ViewingSheet } from "@/src/components/viewings/ViewingSheet";
import { api, type Viewing } from "@/src/lib/api";
import { fmtDay, fmtTime, fmtWhen, statusBadge } from "@/src/lib/viewingTime";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Sheet, Skeleton, useMoneyRain, useToast } from "@/src/ui";

export default function ViewingDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { rain, rainOncePersisted } = useMoneyRain();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [v, setV] = useState<Viewing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [propose, setPropose] = useState(false);
  const [reason, setReason] = useState<null | "decline" | "cancel">(null);
  const [reasonText, setReasonText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      setV(await api.getViewing(id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // A confirmed booking is the milestone — a quiet nod the first time either side sees it.
  useEffect(() => {
    if (v?.status === "confirmed" && id) rainOncePersisted("subtle", `viewing:${id}:confirmed`);
  }, [v?.status, id, rainOncePersisted]);

  const act = async (key: string, fn: () => Promise<Viewing>, okTitle: string) => {
    if (busy) return;
    setBusy(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const next = await fn();
      setV(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(okTitle);
      if (next.status === "confirmed") rain({ variant: "subtle", key: `viewing:${next.id}:confirmed`, once: true });
    } catch (e: any) {
      toast.error("That didn't go through", e?.message ?? "Please try again.");
      load();
    } finally {
      setBusy(null);
    }
  };

  const openChat = async () => {
    if (!v || chatBusy) return;
    setChatBusy(true);
    try {
      const c = v.role === "buyer" ? await api.chatStartFromProperty(v.property_id) : await api.chatStartDirect(v.buyer_id);
      router.push(`/chat/${c.id}` as any);
    } catch (e: any) {
      toast.error("Cannot open chat", e?.message ?? "Try again");
    } finally {
      setChatBusy(false);
    }
  };

  if (loading && !v) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Viewing" />
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={120} radius={radii.xl} />
          <Skeleton height={80} radius={radii.lg} />
          <Skeleton height={56} radius={radii.lg} />
        </View>
      </Screen>
    );
  }
  if (error || !v) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Viewing" />
        <EmptyState variant={error ? "error" : "empty"} icon="calendar-outline" title={error ? "Couldn't load this viewing" : "Viewing not found"} body={error ? "Check your connection and try again." : "It may have been removed."} actionLabel={error ? "Retry" : "Go back"} onAction={error ? load : () => router.back()} />
      </Screen>
    );
  }

  const badge = statusBadge(v.status, v.awaiting, v.role);
  const other = v.role === "agent" ? v.buyer : v.agent;
  const closed = !["requested", "confirmed", "rescheduled"].includes(v.status);
  const lastNote = [...(v.history ?? [])].reverse().find((h) => h.note)?.note;
  const headline =
    v.status === "confirmed"
      ? "You're all set"
      : v.status === "requested"
        ? v.role === "agent"
          ? "A buyer wants to visit"
          : "Waiting for the agent"
        : v.status === "rescheduled"
          ? v.awaiting === v.role
            ? "A new time was suggested"
            : "Waiting for a reply"
          : v.status === "declined"
            ? "The agent couldn't make it"
            : v.status === "cancelled"
              ? "This viewing was cancelled"
              : "Viewing done";

  return (
    <Screen testID="viewing-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Viewing" subtitle={v.role === "agent" ? "Request on your listing" : "Your visit"} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 40 + insets.bottom, gap: space[4] }} showsVerticalScrollIndicator={false}>
        {/* When */}
        <View style={[styles.hero, { backgroundColor: v.status === "confirmed" ? colors.successSoft : v.status === "declined" || v.status === "cancelled" ? colors.surfaceAlt : colors.warningSoft }]} testID="viewing-hero">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Badge label={badge.label} tone={badge.tone} size="sm" testID="viewing-status" />
            <AppText variant="micro" tone="tertiary">
              Lagos time
            </AppText>
          </View>
          <AppText variant="h2" style={{ marginTop: 10 }}>
            {headline}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
            <Ionicons name="calendar" size={18} color={colors.text} />
            <AppText variant="title" tabular testID="viewing-when">
              {fmtDay(v.start, { relative: true })} · {fmtTime(v.start)}–{fmtTime(v.end)}
            </AppText>
          </View>
          {lastNote ? (
            <View style={[styles.note, { backgroundColor: colors.bgElevated }]} testID="viewing-note-text">
              <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.textSecondary} />
              <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                “{lastNote}”
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Property */}
        <Card elevation="xs" padded={false} style={{ padding: 10 }} onPress={() => router.push(`/property/${v.property_id}?rained=1` as any)} testID="viewing-property">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {v.property_image ? <Image source={{ uri: v.property_image }} style={[styles.propImg, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={150} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {v.property_title ?? "Home"}
              </AppText>
              <AppText variant="caption" tone="tertiary">
                {v.property_city ?? ""} · Open listing
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </Card>

        {/* Counterpart */}
        <Card elevation="xs" style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar name={other?.full_name} uri={other?.avatar_url ?? undefined} size={48} verified={!!other?.verified} />
            <View style={{ flex: 1 }}>
              <AppText variant="title">{other?.full_name ?? (v.role === "agent" ? "Buyer" : "Agent")}</AppText>
              <AppText variant="caption" tone="tertiary">
                {v.role === "agent" ? "Buyer · unlocked this home" : "Listing agent"}
              </AppText>
            </View>
          </View>
          <Button label="Message" variant="secondary" size="sm" iconLeft="chatbubbles-outline" loading={chatBusy} onPress={openChat} testID="viewing-chat" />
        </Card>

        {/* Actions */}
        {!closed ? (
          <View style={{ gap: 10 }} testID="viewing-actions">
            {v.can_confirm ? <Button label={v.status === "rescheduled" ? `Confirm ${fmtWhen(v.start)}` : "Confirm viewing"} variant="primary" size="lg" fullWidth iconLeft="checkmark-circle" loading={busy === "confirm"} onPress={() => act("confirm", () => api.confirmViewing(v.id), "Viewing confirmed")} testID="viewing-confirm" /> : null}
            {v.can_propose ? <Button label="Suggest another time" variant="secondary" size="lg" fullWidth iconLeft="time-outline" onPress={() => setPropose(true)} testID="viewing-propose" /> : null}
            {v.can_complete ? <Button label="Mark as done" variant="secondary" size="md" fullWidth iconLeft="checkmark-done" loading={busy === "complete"} onPress={() => act("complete", () => api.completeViewing(v.id), "Marked as done")} testID="viewing-complete" /> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {v.can_decline ? <Button label="Decline" variant="ghost" size="md" iconLeft="close-circle-outline" onPress={() => setReason("decline")} style={{ flex: 1 }} testID="viewing-decline" /> : null}
              {v.can_cancel && !v.can_decline ? <Button label="Cancel viewing" variant="ghost" size="md" iconLeft="trash-outline" onPress={() => setReason("cancel")} style={{ flex: 1 }} testID="viewing-cancel" /> : null}
            </View>
          </View>
        ) : v.status === "declined" || v.status === "cancelled" ? (
          v.role === "buyer" ? (
            <Button label="Request another time" variant="primary" size="lg" fullWidth iconLeft="calendar" onPress={() => router.push(`/property/${v.property_id}?rained=1&book=1` as any)} testID="viewing-rebook" />
          ) : null
        ) : null}

        {/* History */}
        <View style={{ gap: 8 }}>
          <AppText variant="h3">Timeline</AppText>
          {[...(v.history ?? [])].reverse().map((h, i) => (
            <View key={`${h.at}-${i}`} style={styles.histRow}>
              <View style={[styles.dot, { backgroundColor: i === 0 ? colors.text : colors.border }]} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodySm">
                  {h.by === "agent" ? "Agent" : "Buyer"} {historyVerb(h.action)}
                  {h.start && (h.action === "requested" || h.action === "proposed") ? ` · ${fmtWhen(h.start)}` : ""}
                </AppText>
                <AppText variant="micro" tone="tertiary">
                  {new Date(h.at).toLocaleString()}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <ViewingSheet
        visible={propose}
        onClose={() => setPropose(false)}
        mode="propose"
        viewingId={v.id}
        propertyId={v.property_id}
        agentId={v.agent_id}
        asAgent={v.role === "agent"}
        onDone={(next) => {
          setPropose(false);
          setV(next);
          toast.success("New time suggested", `${other?.full_name ?? "They"} will confirm in the app.`);
        }}
      />

      <Sheet visible={reason !== null} onClose={() => setReason(null)} title={reason === "decline" ? "Decline this viewing?" : "Cancel this viewing?"} testID="viewing-reason-sheet">
        <View style={{ gap: space[3] }}>
          <AppText variant="bodySm" tone="secondary">
            {reason === "decline" ? "The buyer will be told and can request another time." : "The other side will be told right away."}
          </AppText>
          <Input label="Reason (optional)" value={reasonText} onChangeText={setReasonText} placeholder={reason === "decline" ? "e.g. Away that week" : "e.g. Something came up"} multiline maxLength={400} testID="viewing-reason" />
          <Button
            label={reason === "decline" ? "Decline viewing" : "Cancel viewing"}
            variant="destructive"
            size="lg"
            fullWidth
            loading={busy === "decline" || busy === "cancel"}
            onPress={async () => {
              const r = reason!;
              const note = reasonText.trim() || undefined;
              setReason(null);
              setReasonText("");
              await act(r, () => (r === "decline" ? api.declineViewing(v.id, note) : api.cancelViewing(v.id, note)), r === "decline" ? "Viewing declined" : "Viewing cancelled");
            }}
            testID="viewing-reason-submit"
          />
          <Button label="Keep it" variant="ghost" size="md" fullWidth onPress={() => setReason(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function historyVerb(action: string): string {
  switch (action) {
    case "requested":
      return "requested a viewing";
    case "proposed":
      return "suggested a new time";
    case "confirmed":
      return "confirmed";
    case "declined":
      return "declined";
    case "cancelled":
      return "cancelled";
    case "completed":
      return "marked it done";
    default:
      return action;
  }
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[4] },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: radii.md, marginTop: 12 },
  propImg: { width: 56, height: 56, borderRadius: radii.md },
  histRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
