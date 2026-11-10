/**
 * Scan with AI — photograph an appliance (and optionally its receipt); AMASS AI CORE suggests the details,
 * the user confirms or edits, then it's saved as an item. AI never invents price, date, serial or warranty:
 * those only come from the receipt or the user.
 */
import React, { useEffect, useMemo, useState } from "react";
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
import { homeApi, homeHubSignal, newId, uploadFile, type AiIdentify, type AiReceipt, type FileRef, type ItemCategory, type ItemCondition } from "@/src/lib/homeHub";
import { AppText, Badge, Button, Card, Input, Screen, ScreenHeader, Skeleton, useToast } from "@/src/ui";
import { ChipRow, ROOMS, ROOM_ICON, naira } from "@/src/components/home/HomeBits";
import { Field, HomePicker, MoneyInput } from "@/src/components/home/FormBits";
import { DateField } from "@/src/components/home/Calendar";
import { AttachSheet } from "@/src/components/home/AttachSheet";
import { CategoryStrip } from "@/src/components/home/HomeVisuals";
import { ITEM_CATEGORIES, categoryArt } from "@/src/components/home/homeArt";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

type Stage = "pick" | "thinking" | "confirm";
const CONDITIONS: { key: ItemCondition; label: string }[] = [
  { key: "new", label: "New" },
  { key: "good", label: "Good" },
  { key: "fair", label: "Fair" },
  { key: "poor", label: "Poor" },
];

export default function ScanItem() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const params = useLocalSearchParams<{ home_id?: string }>();
  const { homes, homeId: selectedId, ready } = useSelectedHome();

  const [homeId, setHomeId] = useState<string | null>(params.home_id || null);
  const [stage, setStage] = useState<Stage>("pick");
  const [attach, setAttach] = useState<"photo" | "receipt" | null>(null);
  const [photo, setPhoto] = useState<FileRef | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<FileRef | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [ai, setAi] = useState<AiIdentify | null>(null);
  const [aiReceipt, setAiReceipt] = useState<AiReceipt | null>(null);
  const [readingReceipt, setReadingReceipt] = useState(false);

  // confirmable fields
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory | null>(null);
  const [room, setRoom] = useState<string>("Living room");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [condition, setCondition] = useState<ItemCondition | null>(null);
  const [store, setStore] = useState("");
  const [purchasedAt, setPurchasedAt] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  /** Where "Worth now" came from — the receipt price beats the AI guess, and a hand-typed value beats both. */
  const [valueSource, setValueSource] = useState<"ai" | "receipt" | "user" | null>(null);
  const [warranty, setWarranty] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!homeId && ready && selectedId && selectedId !== "all") setHomeId(selectedId);
    if (!homeId && ready && (!selectedId || selectedId === "all") && homes[0]) setHomeId(homes.find((h) => h.is_default)?.id ?? homes[0].id);
  }, [ready, selectedId, homes, homeId]);

  const identify = async (file: FileRef) => {
    setStage("thinking");
    try {
      const r = await homeApi.aiIdentify({ path: file.path });
      setAi(r);
      if (!r.is_household_item) {
        toast.info("That doesn't look like a household item", "You can still add it by hand below.");
      }
      setName(r.name ?? "");
      setCategory(r.category ?? "other");
      if (r.room) setRoom(r.room);
      setBrand(r.brand ?? "");
      setModel(r.model ?? "");
      setSerial(r.serial ?? "");
      setCondition(r.condition ?? null);
      if (r.replacement_value && (value == null || valueSource === "ai")) {
        setValue(Math.round((r.replacement_value.low + r.replacement_value.high) / 2));
        setValueSource("ai");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("AI couldn't read that photo", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "You can fill the details in yourself.");
      setAi(null);
    } finally {
      setStage("confirm");
    }
  };

  const readReceipt = async (file: FileRef) => {
    setReadingReceipt(true);
    try {
      const r = await homeApi.aiReceipt({ path: file.path });
      setAiReceipt(r);
      if (!r.is_receipt) toast.info("That doesn't look like a receipt", "Enter the price and date by hand if you like.");
      if (r.store && !store) setStore(r.store);
      if (r.purchased_at) setPurchasedAt(r.purchased_at);
      const line = r.items.find((it) => it.price) ?? null;
      const amt = r.items.length === 1 && line?.price ? line.price : r.total;
      if (amt) {
        setPrice(Math.round(amt));
        if (valueSource !== "user") {
          // What you paid is the best guide to what it's worth — the AI's shop-price guess can be far off.
          if (value != null && valueSource === "ai" && Math.abs(value - amt) / amt > 0.5) toast.info("Worth now updated from the receipt", `AI guessed ${naira(value)}; the receipt says ${naira(Math.round(amt))}. Change it if you disagree.`);
          setValue(Math.round(amt));
          setValueSource("receipt");
        }
      }
      if (r.warranty_months && r.purchased_at) setWarranty(dayjs(r.purchased_at).add(r.warranty_months, "month").format("YYYY-MM-DD"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("AI couldn't read the receipt", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Enter the price and date by hand.");
    } finally {
      setReadingReceipt(false);
    }
  };

  const errors = useMemo(() => ({ name: !name.trim() ? "What is it called?" : null, home: !homeId ? "Pick a home" : null }), [name, homeId]);
  const valid = !errors.name && !errors.home;

  const save = async () => {
    if (!valid || !homeId) return;
    setSaving(true);
    try {
      const id = newId();
      const item = await homeApi.createItem({ id, home_id: homeId, name: name.trim(), room, category: category ?? "other", condition, photo, brand: brand.trim() || null, model: model.trim() || null, serial: serial.trim() || null, store: store.trim() || null, purchased_at: purchasedAt, price, value, warranty_until: warranty, warranty_reminders: warranty ? [30, 7] : [], notes: ai?.notes ?? null });
      if (receipt) {
        await homeApi.createRecord({ home_id: homeId, title: `${name.trim()} receipt`, folder: "receipts", file: receipt, item_id: item.id, notes: aiReceipt?.store ? `Bought at ${aiReceipt.store}` : null }).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      homeHubSignal.bump();
      toast.success(`${name.trim()} added`, receipt ? "Receipt filed under Records." : warranty ? "We'll remind you before the warranty ends." : undefined);
      router.replace(`/home/items/${item.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't save the item", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const confidence = ai ? Math.round(ai.confidence * 100) : null;

  return (
    <Screen testID="scan-screen">
      <ScreenHeader title="Scan with AI" subtitle="Photo → details you confirm" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home" as any))} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 160, gap: space[4] }} keyboardShouldPersistTaps="handled">
        {/* Step 1 — photo */}
        {stage === "pick" ? (
          <View style={{ gap: 14 }}>
            <Pressable onPress={() => setAttach("photo")} accessibilityRole="button" accessibilityLabel="Take or choose a photo of the item" style={[styles.drop, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} testID="scan-pick-photo">
              <View style={[styles.dropIcon, { backgroundColor: colors.text }]}>
                <Ionicons name="camera" size={30} color={colors.bg} />
              </View>
              <AppText variant="title" align="center">
                Photograph the item
              </AppText>
              <AppText variant="caption" tone="secondary" align="center">
                TV, fridge, AC, generator, laptop… AI identifies it and suggests the category, brand and a replacement value.
              </AppText>
            </Pressable>
            <View style={styles.tipRow}>
              {ITEM_CATEGORIES.slice(0, 5).map((c) => (
                <View key={c.key} style={styles.tipArt}>
                  <Image source={categoryArt(c.key)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                </View>
              ))}
              <AppText variant="micro" tone="tertiary" style={{ flex: 1 }}>
                Works best in good light, with the brand label visible.
              </AppText>
            </View>
            <Pressable onPress={() => router.replace({ pathname: "/home/items/new", params: { home_id: homeId ?? "" } } as any)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "center" }} testID="scan-manual">
              <AppText variant="caption" tone="brand">
                Add by hand instead
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {/* Thinking */}
        {stage === "thinking" ? (
          <Card elevation="sm" style={{ gap: 14, alignItems: "center", paddingVertical: 24 }} testID="scan-thinking">
            {preview ? <Image source={{ uri: preview }} style={styles.thinkImg} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="sparkles" size={18} color={colors.mass} />
              <AppText variant="title">Looking at your photo…</AppText>
            </View>
            <View style={{ width: "100%", gap: 8 }}>
              <Skeleton height={14} radius={7} />
              <Skeleton height={14} radius={7} width="70%" />
            </View>
          </Card>
        ) : null}

        {/* Step 2 — confirm */}
        {stage === "confirm" ? (
          <View style={{ gap: space[4] }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Pressable onPress={() => setAttach("photo")} accessibilityRole="button" accessibilityLabel="Retake photo" style={styles.thumbWrap} testID="scan-retake">
                {preview ? <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <Image source={categoryArt(category)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />}
                <View style={styles.thumbBadge}>
                  <Ionicons name="camera" size={12} color="#111" />
                </View>
              </Pressable>
              <View style={{ flex: 1, gap: 4 }}>
                {ai ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Badge label={confidence != null && confidence >= 70 ? `AI · ${confidence}% sure` : "AI · please check"} tone={confidence != null && confidence >= 70 ? "mass" : "warning"} icon="sparkles" size="xs" testID="scan-confidence" />
                    {ai.colour ? <Badge label={ai.colour} tone="neutral" size="xs" /> : null}
                  </View>
                ) : (
                  <Badge label="Fill in the details" tone="neutral" size="xs" />
                )}
                <AppText variant="caption" tone="secondary" numberOfLines={3}>
                  {ai?.is_household_item ? "Check what AI found and fix anything that's off. Nothing is saved until you tap Add." : "Tell us what it is — everything else is optional."}
                </AppText>
              </View>
            </View>

            <HomePicker homes={homes} value={homeId} onChange={setHomeId} />
            <Input label="Name" value={name} onChangeText={setName} placeholder='e.g. Samsung 55" TV' error={!name.trim() ? errors.name : null} size="lg" testID="scan-name" />
            <Field label="Category">
              <View style={{ marginHorizontal: -space[4] }}>
                <CategoryStrip value={category} onChange={(c) => setCategory(c ?? "other")} allLabel="Pick" testIDPrefix="scan-cat" />
              </View>
            </Field>
            <Field label="Room">
              <ChipRow options={ROOMS.map((r) => ({ key: r, label: r, icon: ROOM_ICON[r] }))} value={room} onChange={setRoom} testIDPrefix="scan-room" />
            </Field>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Input label="Brand" value={brand} onChangeText={setBrand} placeholder="Samsung" containerStyle={{ flex: 1 }} testID="scan-brand" />
              <Input label="Model" value={model} onChangeText={setModel} placeholder="QN55" containerStyle={{ flex: 1 }} testID="scan-model" />
            </View>
            <Input label="Serial number" value={serial} onChangeText={setSerial} placeholder="Only if you can see it on the label" autoCapitalize="characters" testID="scan-serial" />
            <Field label="Condition">
              <ChipRow options={CONDITIONS} value={condition} onChange={setCondition} allowClear testIDPrefix="scan-cond" />
            </Field>

            {/* Receipt */}
            <Card elevation="xs" style={{ gap: 10 }} testID="scan-receipt-card">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.recIcon, { backgroundColor: colors.infoSoft }]}>
                  <Ionicons name="receipt" size={20} color={colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">Have the receipt?</AppText>
                  <AppText variant="caption" tone="secondary">
                    AI reads the price, date and store from a photo. We file it under Records for you.
                  </AppText>
                </View>
              </View>
              {receipt || receiptPreview ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {receiptPreview ? <Image source={{ uri: receiptPreview }} style={{ width: 52, height: 52, borderRadius: radii.md }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" tone="secondary" testID="scan-receipt-status">
                      {readingReceipt ? "Reading receipt…" : aiReceipt?.is_receipt ? `Read${aiReceipt.store ? ` · ${aiReceipt.store}` : ""}${aiReceipt.total ? ` · ${naira(aiReceipt.total)}` : ""}` : aiReceipt ? "Couldn't read it — check the fields below" : "Attached"}
                    </AppText>
                    {aiReceipt?.missing?.length ? (
                      <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                        Not found: {aiReceipt.missing.map((m) => m.replace(/_/g, " ").toLowerCase()).join(", ")}
                      </AppText>
                    ) : null}
                  </View>
                  <Button label="Replace" size="sm" variant="ghost" onPress={() => setAttach("receipt")} disabled={readingReceipt} testID="scan-receipt-replace" />
                </View>
              ) : (
                <Button label="Scan receipt" size="sm" variant="secondary" iconLeft="scan" onPress={() => setAttach("receipt")} style={{ alignSelf: "flex-start" }} testID="scan-receipt-add" />
              )}
            </Card>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <MoneyInput label="Paid (₦)" value={price} onChange={(v) => { setPrice(v); if (value == null || value === price || valueSource !== "user") { setValue(v); setValueSource(v == null ? null : "receipt"); } }} testID="scan-price" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <MoneyInput label="Worth now (₦)" value={value} onChange={(v) => { setValue(v); setValueSource(v == null ? null : "user"); }} testID="scan-value" />
              </View>
            </View>
            {ai?.replacement_value ? (
              <View style={[styles.estimate, { backgroundColor: colors.massSoft }]} testID="scan-estimate">
                <Ionicons name="information-circle" size={16} color={colors.massText} />
                <AppText variant="micro" color={colors.massText} style={{ flex: 1 }}>
                  AI estimate to replace new: {naira(ai.replacement_value.low)} – {naira(ai.replacement_value.high)}. {ai.replacement_value.basis}
                </AppText>
              </View>
            ) : null}
            <Input label="Bought from" value={store} onChangeText={setStore} placeholder="e.g. Slot, Jumia, Computer Village" testID="scan-store" />
            <DateField label="Bought on" value={purchasedAt} onChange={setPurchasedAt} allowClear quick="past" testID="scan-purchased" />
            <DateField label="Warranty until" value={warranty} onChange={setWarranty} allowClear icon="shield-checkmark" helper="Only from the receipt or warranty card — AI never guesses this." testID="scan-warranty" />
            {ai?.missing?.length ? (
              <AppText variant="micro" tone="tertiary">
                AI couldn&apos;t see: {ai.missing.join(", ")}.
              </AppText>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {stage === "confirm" ? (
        <View style={[styles.sticky, shadows.lg, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.bgElevated }]}>
          <AppText variant="micro" tone="tertiary" align="center">
            Saved privately to {homes.find((x) => x.id === homeId)?.name ?? "your home"}.
          </AppText>
          <Button label="Add to My Home" size="lg" fullWidth loading={saving} disabled={!valid || readingReceipt} iconLeft="checkmark" onPress={save} testID="scan-save" />
        </View>
      ) : null}

      <AttachSheet
        visible={attach !== null}
        onClose={() => setAttach(null)}
        title={attach === "receipt" ? "Receipt photo" : "Item photo"}
        photosOnly
        onPicked={async (o) => {
          const which = attach;
          setAttach(null);
          try {
            if (which === "receipt") {
              setReceiptPreview(o.previewUri);
              const f = await uploadFile(o.input);
              setReceipt(f);
              await readReceipt(f);
            } else {
              setPreview(o.previewUri);
              setStage("thinking");
              const f = await uploadFile(o.input);
              setPhoto(f);
              await identify(f);
            }
          } catch (e: any) {
            toast.error("Upload failed", e?.message ?? "Check your connection and try again.");
            if (which !== "receipt") setStage(photo ? "confirm" : "pick");
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  drop: { borderRadius: radii.xl, borderWidth: 1.5, borderStyle: "dashed", padding: 24, alignItems: "center", gap: 10, minHeight: 220, justifyContent: "center" },
  dropIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tipArt: { width: 34, height: 34, borderRadius: 17, overflow: "hidden" },
  thinkImg: { width: 140, height: 140, borderRadius: radii.xl },
  thumbWrap: { width: 84, height: 84, borderRadius: radii.lg, overflow: "hidden", backgroundColor: "#eee" },
  thumbBadge: { position: "absolute", right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  recIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  estimate: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: radii.md },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 12, gap: 8, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
