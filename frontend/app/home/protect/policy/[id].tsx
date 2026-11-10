/**
 * Policy detail — cover hero, what's covered, insured appliances, claims, insurer contact.
 */
import React, { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { ApiError } from "@/src/lib/api";
import { protectApi, type Policy } from "@/src/lib/homeProtect";
import { AppText, Button, Card, EmptyState, Screen, ScreenHeader, Section, SkeletonRows, useToast } from "@/src/ui";
import { Fact, FileThumb, fmtDate, naira } from "@/src/components/home/HomeBits";
import { categoryArt } from "@/src/components/home/homeArt";
import { ClaimRow, Line, PerilChips, PolicyHero, massFmt } from "@/src/components/home/ProtectBits";

export default function PolicyScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setPolicy(await protectApi.policy(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else toast.error("Couldn't load this policy");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (missing)
    return (
      <Screen testID="policy-missing">
        <ScreenHeader title="Policy" onBack={() => router.back()} />
        <EmptyState title="Policy not found" body="It may belong to another account." actionLabel="Back to Home Protect" onAction={() => router.replace("/home/protect" as any)} />
      </Screen>
    );
  if (!policy)
    return (
      <Screen testID="policy-loading">
        <ScreenHeader title="Policy" onBack={() => router.back()} />
        <SkeletonRows rows={6} />
      </Screen>
    );

  const live = policy.state === "active" || policy.state === "expiring";
  const perils = Object.fromEntries((policy.cover?.perils ?? []).map((k, i) => [k, policy.perils_labels?.[i] ?? k]));
  const contact = policy.partner ?? {};

  return (
    <Screen testID="policy-screen">
      <ScreenHeader title={policy.policy_no} subtitle={`${policy.plan_name} · ${policy.partner_name}`} onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/protect" as any))} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} showsVerticalScrollIndicator={false}>
        <PolicyHero policy={policy} testID="policy-hero" />

        {live ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Make a claim" size="lg" iconLeft="umbrella" onPress={() => router.push({ pathname: "/home/protect/claims/new", params: { policy_id: policy.id } } as any)} style={{ flex: 1.6 }} testID="policy-claim" />
            {policy.addable_items?.length ? <Button label="Add" size="lg" variant="secondary" iconLeft="add" onPress={() => router.push({ pathname: "/home/protect/quote", params: { home_id: policy.home_id, policy_id: policy.id } } as any)} style={{ flex: 0.8 }} testID="policy-add-items" /> : null}
          </View>
        ) : (
          <Button label="Get new cover" size="lg" iconLeft="refresh" onPress={() => router.push({ pathname: "/home/protect/quote", params: { home_id: policy.home_id } } as any)} testID="policy-renew" />
        )}

        <Card elevation="xs" style={{ gap: 2 }} testID="policy-facts">
          <Fact icon="shield-checkmark-outline" label="Insurer" value={`${policy.partner_name}${contact.licence ? ` · ${contact.licence}` : ""}`} />
          <Fact icon="home-outline" label="Home" value={[policy.home_name, policy.home_address].filter(Boolean).join(" · ")} />
          <Fact icon="calendar-outline" label="Cover" value={`${fmtDate(policy.starts_at, true)} → ${fmtDate(policy.expires_at, true)}`} />
          <Fact icon="wallet-outline" label="Paid" value={`${massFmt(policy.total_mass)} (${naira(policy.total_ngn)})${policy.initial_total_mass != null && policy.initial_total_mass !== policy.total_mass ? " incl. add-ons" : ""}`} />
          <Fact icon="receipt-outline" label="Paid on" value={fmtDate(policy.paid_at, true)} />
        </Card>

        <Section title="What's covered" caption={`${policy.plan_name} plan · excess ${naira(policy.cover.excess_ngn) || "₦0"} per claim`} testID="policy-cover">
          <Card elevation="xs" style={{ gap: 10 }}>
            {policy.cover.include_building ? <Line label="The building" value={`up to ${naira(policy.cover.building_limit_ngn)}`} /> : <Line label="The building" value="not included" tone="secondary" />}
            <Line label="Household contents" value={`up to ${naira(policy.cover.contents_limit_ngn)}`} />
            <Line label="Appliances" value={`${policy.insured_items} insured · ${naira(policy.insured_value_ngn) || "₦0"}`} />
            <PerilChips keys={policy.cover.perils} perils={perils} />
          </Card>
        </Section>

        <Section title="Insured appliances" caption={policy.items.length ? `${policy.items.length} item${policy.items.length === 1 ? "" : "s"}` : "None on this policy"} actionLabel={live && policy.addable_items?.length ? "Add" : undefined} onAction={() => router.push({ pathname: "/home/protect/quote", params: { home_id: policy.home_id, policy_id: policy.id } } as any)} testID="policy-items">
          {policy.items.length ? (
            <Card elevation="xs" padded={false}>
              {policy.items.map((it, i) => (
                <Pressable key={it.item_id} onPress={() => router.push(`/home/items/${it.item_id}` as any)} accessibilityRole="button" accessibilityLabel={`${it.name}, insured for ${naira(it.value)}`} style={[styles.row, i < policy.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} testID={`policy-item-${it.item_id}`}>
                  {it.photo ? <FileThumb file={it.photo} size={46} radius={radii.md} /> : <Image source={categoryArt(it.category)} style={{ width: 46, height: 46, borderRadius: radii.md }} contentFit="cover" accessibilityIgnoresInvertColors />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodyMedium" numberOfLines={1}>
                      {it.name}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1}>
                      Insured for {naira(it.value)} · {naira(it.premium_ngn)} premium{it.room ? ` · ${it.room}` : ""}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </Card>
          ) : (
            <AppText variant="bodySm" tone="tertiary">
              Only the building and contents are covered. Add appliances any time while the policy is live.
            </AppText>
          )}
        </Section>

        <Section title="Claims" caption={policy.claims?.length ? `${policy.claims.length} on this policy` : "No claims on this policy"} actionLabel={live ? "New claim" : undefined} onAction={() => router.push({ pathname: "/home/protect/claims/new", params: { policy_id: policy.id } } as any)} testID="policy-claims">
          {policy.claims?.length ? (
            <Card elevation="xs" padded={false}>
              {policy.claims.map((c, i, arr) => (
                <ClaimRow key={c.id} claim={c} onPress={() => router.push(`/home/protect/claims/${c.id}` as any)} last={i === arr.length - 1} testID={`policy-claim-${c.id}`} />
              ))}
            </Card>
          ) : null}
        </Section>

        {contact.claims_phone || contact.claims_email ? (
          <Card elevation="xs" style={{ gap: 10 }} testID="policy-contact">
            <AppText variant="label" tone="tertiary" uppercase>
              Insurer claims desk
            </AppText>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {contact.claims_phone ? <Button label="Call" size="sm" variant="secondary" iconLeft="call-outline" onPress={() => Linking.openURL(`tel:${contact.claims_phone}`)} style={{ flex: 1 }} testID="policy-call" /> : null}
              {contact.claims_email ? <Button label="Email" size="sm" variant="secondary" iconLeft="mail-outline" onPress={() => Linking.openURL(`mailto:${contact.claims_email}?subject=${encodeURIComponent(`Policy ${policy.policy_no}`)}`)} style={{ flex: 1 }} testID="policy-email" /> : null}
            </View>
            <AppText variant="micro" tone="tertiary">
              Quote your policy number {policy.policy_no}. Claims made in the app reach the same desk.
            </AppText>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 64 },
});
