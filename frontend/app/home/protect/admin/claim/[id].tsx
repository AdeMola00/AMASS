/**
 * Admin claim decision — everything the reviewer needs on one screen, then one of:
 * start review · ask for more · approve (set payout) · mark paid (MASS to the customer) · reject.
 */
import React, { useCallback, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { ApiError } from "@/src/lib/api";
import { CLAIM_ICON, CLAIM_TONE, protectApi, type Claim, type ClaimStatus } from "@/src/lib/homeProtect";
import { AppText, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Section, Sheet, SkeletonRows, useToast, type IconName } from "@/src/ui";
import { Fact, FileThumb, fmtDate, naira } from "@/src/components/home/HomeBits";
import { MoneyInput } from "@/src/components/home/FormBits";
import { categoryArt } from "@/src/components/home/homeArt";
import { ClaimTimeline, massFmt } from "@/src/components/home/ProtectBits";

type Action = { status: ClaimStatus; label: string; icon: IconName; variant: "primary" | "secondary" | "destructive" | "mass"; needsNote?: boolean; needsPayout?: boolean };

/** Starting point for the reviewer: what was claimed, capped at the insured value / plan limit, less the excess. */
function suggestedPayout(c: Claim): number | null {
  const cover = c.policy?.cover;
  const cap = c.scope === "appliance" ? c.item_value : c.scope === "building" ? cover?.building_limit_ngn : cover?.contents_limit_ngn;
  const claimed = c.amount_claimed_ngn ?? cap ?? null;
  if (claimed == null) return null;
  const capped = cap && cap > 0 ? Math.min(claimed, cap) : claimed;
  return Math.max(0, Math.round(capped - (cover?.excess_ngn ?? 0)));
}

export default function AdminClaim() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [missing, setMissing] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [payout, setPayout] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await protectApi.adminClaim(id);
      setClaim(c);
      setPayout(c.payout_ngn ?? suggestedPayout(c));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setMissing(true);
      else toast.error("Couldn't load this claim");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const decide = async () => {
    if (!claim || !action) return;
    setBusy(true);
    try {
      const c = await protectApi.adminDecide(claim.id, { status: action.status, note: note.trim() || null, payout_ngn: action.needsPayout || action.status === "paid" ? payout : null });
      setClaim({ ...claim, ...c });
      setAction(null);
      setNote("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`Claim ${c.status_label.toLowerCase()}`, action.status === "paid" ? `${massFmt(c.payout_mass)} credited to the customer's wallet.` : "The customer has been notified.");
    } catch (e: any) {
      toast.error("Couldn't update", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message);
    } finally {
      setBusy(false);
    }
  };

  if (missing)
    return (
      <Screen testID="admin-claim-missing">
        <ScreenHeader title="Claim" onBack={() => router.back()} />
        <EmptyState title="Claim not found" actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  if (!claim)
    return (
      <Screen testID="admin-claim-loading">
        <ScreenHeader title="Claim" onBack={() => router.back()} />
        <SkeletonRows rows={6} />
      </Screen>
    );

  const rate = claim.mass_rate_ngn ?? 100;
  const closed = !claim.is_open;
  const actions: Action[] = closed
    ? []
    : [
        ...(claim.status === "submitted" ? [{ status: "under_review", label: "Start review", icon: "search", variant: "secondary" } as Action] : []),
        ...(claim.status !== "more_info" && claim.status !== "approved" ? [{ status: "more_info", label: "Ask for more", icon: "chatbubble-ellipses", variant: "secondary", needsNote: true } as Action] : []),
        ...(claim.status !== "approved" ? [{ status: "approved", label: "Approve", icon: "checkmark-circle", variant: "primary", needsPayout: true } as Action] : []),
        ...(claim.status === "approved" ? [{ status: "paid", label: "Mark paid", icon: "cash", variant: "mass", needsPayout: true } as Action] : []),
        { status: "rejected", label: "Reject", icon: "close-circle", variant: "destructive", needsNote: true },
      ];
  const policyItems = claim.policy?.items ?? [];

  return (
    <Screen testID="admin-claim-screen">
      <ScreenHeader title={claim.claim_no} subtitle={`${claim.policy_no} · ${claim.plan_name ?? ""}`} onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/protect/admin" as any))} right={<Badge label={claim.status_label} tone={CLAIM_TONE[claim.status]} icon={CLAIM_ICON[claim.status] as IconName} size="xs" testID="admin-claim-status" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 60, gap: space[4] }} showsVerticalScrollIndicator={false}>
        {/* Customer */}
        <Card elevation="xs" style={{ gap: 10 }} testID="admin-claim-customer">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
              <Ionicons name="person" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyMedium">{claim.user?.name ?? "Customer"}</AppText>
              <AppText variant="caption" tone="secondary">
                {[claim.user?.email, claim.user?.phone].filter(Boolean).join(" · ")}
              </AppText>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {claim.user?.phone ? <Button label="Call" size="xs" variant="secondary" iconLeft="call-outline" onPress={() => Linking.openURL(`tel:${claim.user!.phone}`)} /> : null}
            {claim.user?.email ? <Button label="Email" size="xs" variant="secondary" iconLeft="mail-outline" onPress={() => Linking.openURL(`mailto:${claim.user!.email}?subject=${encodeURIComponent(`Claim ${claim.claim_no}`)}`)} /> : null}
          </View>
        </Card>

        {/* What was claimed */}
        <Card elevation="xs" style={{ gap: 2 }} testID="admin-claim-facts">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 8 }}>
            {claim.item_photo ? <FileThumb file={claim.item_photo} size={56} radius={radii.md} /> : <Image source={categoryArt(claim.item?.category)} style={{ width: 56, height: 56, borderRadius: radii.md }} contentFit="cover" accessibilityIgnoresInvertColors />}
            <View style={{ flex: 1 }}>
              <AppText variant="title" style={{ fontSize: 17 }}>
                {claim.item_name ?? (claim.scope === "building" ? "The building" : "Household items")}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {claim.incident_label} · {fmtDate(claim.incident_date, true)}
              </AppText>
            </View>
          </View>
          <Fact icon="chatbox-ellipses-outline" label="Account" value={claim.description} />
          <Fact icon="cash-outline" label="Claimed" value={claim.amount_claimed_ngn ? naira(claim.amount_claimed_ngn) : "Not given"} />
          {claim.item_value ? <Fact icon="pricetag-outline" label="Insured for" value={naira(claim.item_value)} /> : null}
          {claim.item ? <Fact icon="business-outline" label="Brand / model" value={[claim.item.brand, claim.item.model, claim.item.serial ? `S/N ${claim.item.serial}` : null].filter(Boolean).join(" · ") || null} /> : null}
          {claim.item?.purchased_at ? <Fact icon="calendar-outline" label="Bought" value={`${fmtDate(claim.item.purchased_at, true)}${claim.item.store ? ` · ${claim.item.store}` : ""}${claim.item.price ? ` · ${naira(claim.item.price)}` : ""}`} /> : null}
          <Fact icon="shield-checkmark-outline" label="Policy" value={`${claim.policy_no} · ${claim.plan_name} · excess ${naira(claim.policy?.cover?.excess_ngn) || "₦0"}`} />
          <Fact icon="list-outline" label="Plan perils" value={(claim.policy?.cover?.perils ?? []).join(", ")} />
          {claim.payout_ngn ? <Fact icon="wallet-outline" label="Payout" value={`${naira(claim.payout_ngn)} = ${massFmt(claim.payout_mass)}${claim.paid_at ? ` · paid ${fmtDate(claim.paid_at, true)}` : ""}`} /> : null}
          {claim.admin_note ? <Fact icon="document-text-outline" label="Last note" value={claim.admin_note} /> : null}
        </Card>
        {claim.coverage_warning ? (
          <View style={[styles.note, { backgroundColor: colors.warningSoft }]} testID="admin-claim-warning">
            <Ionicons name="alert-circle" size={16} color={colors.warning} />
            <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
              {claim.coverage_warning}
            </AppText>
          </View>
        ) : null}

        {claim.photos.length ? (
          <Section title="Photos" caption={`${claim.photos.length} from the customer`}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {claim.photos.map((p, i) => (
                <FileThumb key={`${p.path}-${i}`} file={p} size={120} radius={radii.lg} />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {policyItems.length ? (
          <Section title="Other items on the policy" caption={`${policyItems.length} insured`}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {policyItems.map((it) => (
                <Badge key={it.item_id} label={`${it.name} · ${naira(it.value)}`} tone={it.item_id === claim.item_id ? "brand" : "neutral"} size="xs" />
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="Timeline">
          <Card elevation="xs">
            <ClaimTimeline claim={claim} admin />
          </Card>
        </Section>

        {actions.length ? (
          <View style={{ gap: 8 }} testID="admin-claim-actions">
            <AppText variant="label" tone="tertiary" uppercase>
              Decision
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {actions.map((a) => (
                <Button key={a.status} label={a.label} size="md" variant={a.variant} iconLeft={a.icon} onPress={() => { setAction(a); setNote(""); }} style={{ flexGrow: 1, minWidth: "45%" }} testID={`admin-action-${a.status}`} />
              ))}
            </View>
          </View>
        ) : (
          <Badge label="This claim is closed" tone="neutral" icon="lock-closed-outline" style={{ alignSelf: "center" }} />
        )}
      </ScrollView>

      <Sheet visible={!!action} onClose={() => !busy && setAction(null)} title={action?.label ?? ""} testID="admin-decision-sheet">
        {action ? (
          <View style={{ gap: 14 }}>
            {action.needsPayout ? (
              <View style={{ gap: 6 }}>
                <MoneyInput label={action.status === "paid" ? "Payout to settle (₦)" : "Approved payout (₦)"} value={payout} onChange={setPayout} testID="admin-payout" />
                <AppText variant="caption" tone="secondary" tabular>
                  = {massFmt(Math.ceil((payout ?? 0) / rate))} to the customer&apos;s wallet{action.status === "paid" ? " — credited immediately" : " when marked paid"}.
                </AppText>
                <AppText variant="micro" tone="tertiary" tabular testID="admin-payout-basis">
                  Suggested: {claim.amount_claimed_ngn ? `claimed ${naira(claim.amount_claimed_ngn)}` : "no estimate given"}
                  {claim.scope === "appliance" && claim.item_value ? `, capped at the insured ${naira(claim.item_value)}` : claim.scope === "contents" && claim.policy?.cover?.contents_limit_ngn ? `, capped at the ${naira(claim.policy.cover.contents_limit_ngn)} contents limit` : claim.scope === "building" && claim.policy?.cover?.building_limit_ngn ? `, capped at the ${naira(claim.policy.cover.building_limit_ngn)} building limit` : ""}
                  , less the {naira(claim.policy?.cover?.excess_ngn) || "₦0"} excess.
                </AppText>
              </View>
            ) : null}
            <Input label={action.needsNote ? "Message to the customer" : "Note to the customer (optional)"} value={note} onChangeText={setNote} placeholder={action.status === "more_info" ? "e.g. Please add a photo of the serial label and the receipt" : action.status === "rejected" ? "Explain the decision in plain language" : "Anything the customer should know"} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: "top" }} testID="admin-note" />
            <Button label={action.label} size="lg" fullWidth variant={action.variant} iconLeft={action.icon} loading={busy} disabled={(action.needsNote && !note.trim()) || (action.needsPayout && !(payout && payout > 0))} onPress={decide} testID="admin-decide-confirm" />
            <AppText variant="micro" tone="tertiary" align="center">
              The customer sees this immediately in the app and in their notifications.
            </AppText>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: radii.md },
});
