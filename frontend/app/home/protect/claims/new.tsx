/**
 * Make a claim — what was affected → what happened → when, how much, photos → submit.
 * Reference number + status tracking come straight back; the insurer's decision arrives as a notification.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import dayjs from "dayjs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { ApiError } from "@/src/lib/api";
import { newId, uploadFile, type FileRef } from "@/src/lib/homeHub";
import { protectApi, type Catalog, type ClaimScope, type Policy } from "@/src/lib/homeProtect";
import { AppText, Button, Card, EmptyState, Input, Screen, ScreenHeader, Skeleton, useCelebrate, useToast, type IconName } from "@/src/ui";
import { ChipRow, FileThumb, naira } from "@/src/components/home/HomeBits";
import { Field, MoneyInput } from "@/src/components/home/FormBits";
import { DateField } from "@/src/components/home/Calendar";
import { AttachSheet } from "@/src/components/home/AttachSheet";
import { categoryArt } from "@/src/components/home/homeArt";
import { PERIL_ICON } from "@/src/components/home/ProtectBits";

type Photo = { key: string; preview: string; file?: FileRef; progress: number | null; failed?: boolean };

export default function NewClaim() {
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const params = useLocalSearchParams<{ policy_id?: string; item_id?: string }>();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState<ClaimScope>("appliance");
  const [itemId, setItemId] = useState<string | null>(params.item_id ?? null);
  const [incident, setIncident] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(dayjs().format("YYYY-MM-DD"));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [attach, setAttach] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [claimId] = useState(() => newId());

  const load = useCallback(async () => {
    try {
      const c = await protectApi.catalog();
      setCatalog(c);
      let p: Policy | null = null;
      if (params.policy_id) p = await protectApi.policy(params.policy_id);
      else {
        const s = await protectApi.status();
        p = s.live ? await protectApi.policy(s.live.id) : null;
      }
      if (!p) return setError("none");
      setPolicy(p);
      if (!p.items.length) setScope(p.cover.include_building ? "building" : "contents");
      setError(null);
    } catch {
      setError("load");
    }
  }, [params.policy_id]);
  useEffect(() => {
    load();
  }, [load]);

  const live = policy && (policy.state === "active" || policy.state === "expiring");
  const scopes = useMemo(() => {
    const out: { key: ClaimScope; label: string; icon: IconName }[] = [];
    if (policy?.items.length) out.push({ key: "appliance", label: "An appliance", icon: "cube" });
    out.push({ key: "contents", label: "Household items", icon: "bed" });
    if (policy?.cover.include_building) out.push({ key: "building", label: "The building", icon: "home" });
    return out;
  }, [policy]);
  const item = policy?.items.find((i) => i.item_id === itemId) ?? null;
  const covered = incident ? policy?.cover.perils.includes(incident) || incident === "other" : true;
  const uploading = photos.some((p) => p.progress != null && p.progress < 1);
  const errors = {
    item: scope === "appliance" && !itemId ? "Pick the appliance" : null,
    incident: !incident ? "What happened?" : null,
    date: !date ? "When did it happen?" : null,
    description: description.trim().length < 10 ? "Describe it in a sentence or two" : null,
  };
  const valid = !errors.item && !errors.incident && !errors.date && !errors.description && !uploading;

  const submit = async () => {
    if (!policy || uploading) return;
    if (!valid || !incident || !date) {
      setTried(true);
      toast.info("A few things missing", [errors.item, errors.incident, errors.date, errors.description].filter(Boolean).join(" · "));
      return;
    }
    setSaving(true);
    try {
      const c = await protectApi.createClaim({ id: claimId, policy_id: policy.id, scope, item_id: scope === "appliance" ? itemId : null, incident_type: incident, incident_date: date, description: description.trim(), amount_claimed_ngn: amount, photos: photos.map((p) => p.file).filter(Boolean) as FileRef[] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      celebrate({ title: "Claim sent", body: `Reference ${c.claim_no} · we'll keep you posted`, icon: "paper-plane", tone: "success" });
      router.replace(`/home/protect/claims/${c.id}` as any);
    } catch (e: any) {
      const d = e instanceof ApiError ? e.detail : null;
      toast.error("Couldn't send the claim", typeof d === "string" ? d : d?.message ?? e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/home/protect" as any));

  if (error === "none" || (policy && !live))
    return (
      <Screen testID="claim-no-policy">
        <ScreenHeader title="Make a claim" onBack={back} />
        <EmptyState icon="shield-outline" title={policy ? "This cover has ended" : "No live cover yet"} body={policy ? "Claims can only be made on a live policy for incidents during its term." : "Protect your home and appliances first — then claims take a minute."} actionLabel={policy ? "Get new cover" : "Get a quote"} onAction={() => router.replace({ pathname: "/home/protect/quote", params: policy ? { home_id: policy.home_id } : {} } as any)} actionTestID="claim-get-cover" />
      </Screen>
    );

  return (
    <Screen testID="claim-new-screen">
      <ScreenHeader title="Make a claim" subtitle={policy ? `${policy.policy_no} · ${policy.plan_name}` : undefined} onBack={back} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 170, gap: space[4] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {error === "load" ? <EmptyState variant="error" title="Couldn't load your policy" body="Check your connection and try again." actionLabel="Retry" onAction={load} /> : null}
        {!policy && !error ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={56} radius={radii.lg} />
            <Skeleton height={120} radius={radii.lg} />
          </View>
        ) : null}
        {policy && catalog ? (
          <>
            <Field label="What was affected?">
              <ChipRow options={scopes} value={scope} onChange={(k) => { setScope(k); if (k !== "appliance") setItemId(null); }} testIDPrefix="claim-scope" />
            </Field>
            {scope === "appliance" ? (
              <View style={{ gap: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
                  {policy.items.map((it) => {
                    const on = it.item_id === itemId;
                    return (
                      <Pressable key={it.item_id} onPress={() => { Haptics.selectionAsync().catch(() => {}); setItemId(it.item_id); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={it.name} style={[styles.itemCard, shadows.xs, { backgroundColor: on ? colors.brandSoft : colors.surface, borderColor: on ? colors.brand : colors.border }]} testID={`claim-item-${it.item_id}`}>
                        {it.photo ? <FileThumb file={it.photo} size={56} radius={radii.md} /> : <Image source={categoryArt(it.category)} style={{ width: 56, height: 56, borderRadius: radii.md }} contentFit="cover" accessibilityIgnoresInvertColors />}
                        <AppText variant="caption" numberOfLines={2} align="center" style={{ width: 92 }}>
                          {it.name}
                        </AppText>
                        <AppText variant="micro" tone="tertiary">
                          {naira(it.value)}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {tried && errors.item ? (
                  <AppText variant="micro" tone="error">
                    {errors.item}
                  </AppText>
                ) : null}
              </View>
            ) : null}

            <Field label="What happened?">
              <View style={styles.grid}>
                {catalog.incident_types.map((t) => {
                  const on = incident === t.key;
                  const inPlan = policy.cover.perils.includes(t.key) || t.key === "other";
                  return (
                    <Pressable key={t.key} onPress={() => { Haptics.selectionAsync().catch(() => {}); setIncident(t.key); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${t.label}${inPlan ? "" : ", not listed on your plan"}`} style={[styles.incident, { backgroundColor: on ? colors.text : colors.surface, borderColor: on ? colors.text : colors.border, opacity: inPlan ? 1 : 0.7 }]} testID={`claim-incident-${t.key}`}>
                      <Ionicons name={(PERIL_ICON[t.key] ?? "help-circle") as IconName} size={18} color={on ? colors.bg : colors.textSecondary} />
                      <AppText variant="caption" color={on ? colors.bg : colors.text} numberOfLines={2} style={{ flex: 1 }}>
                        {t.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              {incident && !covered ? (
                <View style={[styles.note, { backgroundColor: colors.warningSoft }]} testID="claim-coverage-warning">
                  <Ionicons name="alert-circle" size={16} color={colors.warning} />
                  <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
                    This isn&apos;t listed on your {policy.plan_name} plan. You can still send it — the insurer decides.
                  </AppText>
                </View>
              ) : null}
            </Field>

            <DateField label="When did it happen?" value={date} onChange={setDate} quick="past" testID="claim-date" />
            <Input label="What happened, in your words" value={description} onChangeText={setDescription} placeholder={scope === "appliance" && item ? `e.g. The ${item.name} stopped working after…` : "e.g. Water came in through the roof during the storm and…"} multiline numberOfLines={4} style={{ minHeight: 100, textAlignVertical: "top" }} error={(tried || description.length) && errors.description ? errors.description : null} testID="claim-description" />
            <MoneyInput label="Estimated loss (₦, optional)" value={amount} onChange={setAmount} testID="claim-amount" />

            <Card elevation="xs" style={{ gap: 10 }} testID="claim-photos">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.photoIcon, { backgroundColor: colors.infoSoft }]}>
                  <Ionicons name="camera" size={20} color={colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">Photos of the damage</AppText>
                  <AppText variant="caption" tone="secondary">
                    Up to 6. Clear photos speed up the decision.
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {photos.map((p) => (
                  <View key={p.key} style={styles.photo}>
                    <Image source={{ uri: p.preview }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                    {p.progress != null && p.progress < 1 ? (
                      <View style={styles.photoOverlay}>
                        <AppText variant="micro" color="#FFFFFF">
                          {Math.round(p.progress * 100)}%
                        </AppText>
                      </View>
                    ) : null}
                    {p.failed ? (
                      <View style={[styles.photoOverlay, { backgroundColor: "rgba(200,0,0,0.6)" }]}>
                        <Ionicons name="alert" size={18} color="#FFFFFF" />
                      </View>
                    ) : null}
                    <Pressable onPress={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove photo" style={styles.remove} testID={`claim-photo-remove-${p.key}`}>
                      <Ionicons name="close" size={14} color="#111" />
                    </Pressable>
                  </View>
                ))}
                {photos.length < 6 ? (
                  <Pressable onPress={() => setAttach(true)} accessibilityRole="button" accessibilityLabel="Add a photo" style={[styles.photo, styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]} testID="claim-add-photo">
                    <Ionicons name="add" size={26} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            </Card>
            <AppText variant="micro" tone="tertiary" align="center">
              Excess on this plan: {naira(policy.cover.excess_ngn) || "₦0"} — the insurer deducts it from any payout. Payouts land in your MASS wallet.
            </AppText>
          </>
        ) : null}
      </ScrollView>

      {policy && catalog ? (
        <View style={[styles.sticky, shadows.lg, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.bgElevated }]}>
          <Button label={uploading ? "Uploading photos…" : "Send claim"} size="lg" fullWidth iconLeft="paper-plane" loading={saving} disabled={uploading} onPress={submit} testID="claim-submit" />
        </View>
      ) : null}

      <AttachSheet
        visible={attach}
        onClose={() => setAttach(false)}
        title="Photo of the damage"
        photosOnly
        onPicked={async (o) => {
          const key = newId();
          setPhotos((ps) => [...ps, { key, preview: o.previewUri, progress: 0 }]);
          try {
            const f = await uploadFile(o.input, (fr) => setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, progress: fr } : p))));
            setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, file: f, progress: 1 } : p)));
          } catch (e: any) {
            setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, progress: null, failed: true } : p)));
            toast.error("Upload failed", e?.message ?? "Check your connection and try again.");
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  itemCard: { width: 112, padding: 10, borderRadius: radii.lg, borderWidth: 1.5, alignItems: "center", gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  incident: { width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, minHeight: 50, borderRadius: radii.lg, borderWidth: 1 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: radii.md, marginTop: 8 },
  photoIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  photo: { width: 84, height: 84, borderRadius: radii.md, overflow: "hidden", backgroundColor: "#eee" },
  addPhoto: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed" },
  photoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  remove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 12, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
