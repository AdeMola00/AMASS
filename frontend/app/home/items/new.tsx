/**
 * Add / edit a household item: photo, name, room, purchase details, value and warranty.
 * Three taps: + → Item → Save (room chip + a name is enough; everything else is optional).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, newId, saveOrQueue, uploadFile, withRetry, type FileRef, type ItemIn } from "@/src/lib/homeHub";
import { AppText, Input, Screen, SkeletonRows, useToast } from "@/src/ui";
import { ChipRow, ROOMS, ROOM_ICON } from "@/src/components/home/HomeBits";
import { DateField } from "@/src/components/home/Calendar";
import { AttachmentTile, Field, FormShell, HomePicker, MoneyInput, ReminderChips } from "@/src/components/home/FormBits";
import { AttachSheet } from "@/src/components/home/AttachSheet";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

const WARRANTY_OPTS = [
  { key: 0, label: "On the day" },
  { key: 7, label: "1 week before" },
  { key: 30, label: "1 month before" },
];

export default function ItemForm() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string; home_id?: string; room?: string }>();
  const editing = !!params.id;
  const { homes, homeId: selectedId, ready } = useSelectedHome();

  const [homeId, setHomeId] = useState<string | null>(params.home_id || null);
  const [name, setName] = useState("");
  const [room, setRoom] = useState<string>(params.room || "Living room");
  const [photo, setPhoto] = useState<FileRef | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [attach, setAttach] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [store, setStore] = useState("");
  const [purchasedAt, setPurchasedAt] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [warranty, setWarranty] = useState<string | null>(null);
  const [warrantyReminders, setWarrantyReminders] = useState<number[]>([30, 7]);
  const [notes, setNotes] = useState("");
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!homeId && ready && selectedId && selectedId !== "all") setHomeId(selectedId);
    if (!homeId && ready && (!selectedId || selectedId === "all") && homes[0]) setHomeId(homes.find((h) => h.is_default)?.id ?? homes[0].id);
  }, [ready, selectedId, homes, homeId]);
  useEffect(() => {
    if (!params.id) return;
    homeApi
      .item(params.id)
      .then((it) => {
        setHomeId(it.home_id);
        setName(it.name);
        setRoom(it.room);
        setPhoto(it.photo ?? null);
        setBrand(it.brand ?? "");
        setModel(it.model ?? "");
        setSerial(it.serial ?? "");
        setStore(it.store ?? "");
        setPurchasedAt(it.purchased_at ?? null);
        setPrice(it.price ?? null);
        setValue(it.value ?? null);
        setWarranty(it.warranty_until ?? null);
        if (it.warranty_reminders?.length) setWarrantyReminders(it.warranty_reminders);
        setNotes(it.notes ?? "");
        setMore(!!(it.brand || it.model || it.serial || it.store || it.notes));
      })
      .catch(() => toast.error("Couldn't load this item"))
      .finally(() => setLoading(false));
  }, [params.id, toast]);

  const errors = useMemo(() => ({ name: !name.trim() ? "What is it called?" : null, home: !homeId ? "Pick a home" : null }), [name, homeId]);
  const valid = !errors.name && !errors.home;
  const uploading = progress != null && progress < 1;

  const save = async () => {
    setTried(true);
    if (!valid || !homeId || uploading) return;
    setSaving(true);
    const body: ItemIn = { home_id: homeId, name: name.trim(), room, photo, brand: brand.trim() || null, model: model.trim() || null, serial: serial.trim() || null, store: store.trim() || null, purchased_at: purchasedAt, price, value, warranty_until: warranty, warranty_reminders: warranty ? warrantyReminders : [], notes: notes.trim() || null };
    try {
      if (editing && params.id) {
        await withRetry(() => homeApi.updateItem(params.id!, body));
        toast.success("Item updated");
      } else {
        const id = newId();
        const out = await saveOrQueue({ id, kind: "item", body: { ...body, id }, title: body.name }, () => homeApi.createItem({ ...body, id }));
        if (out.saved) toast.success(`${body.name} added`, warranty ? "We'll remind you before the warranty ends." : undefined);
        else toast.info("Saved on this phone", "It will sync as soon as you're back online.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      homeHubSignal.bump();
      if (router.canGoBack()) router.back();
      else router.replace("/home/items" as any);
    } catch (e: any) {
      toast.error("Couldn't save the item", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Screen testID="item-form-loading">
        <SkeletonRows rows={6} />
      </Screen>
    );

  return (
    <FormShell title={editing ? "Edit item" : "New item"} subtitle="Photo, room, value, warranty" onSave={save} saveLabel={editing ? "Save changes" : "Add item"} saving={saving} disabled={uploading} testID="item-form">
      <HomePicker homes={homes} value={homeId} onChange={setHomeId} />
      <AttachmentTile
        file={photo}
        previewUri={preview}
        progress={progress}
        label="Add a photo"
        onAdd={() => setAttach(true)}
        onRemove={() => {
          setPhoto(null);
          setPreview(null);
        }}
        testID="item-photo"
      />
      <Input label="Name" value={name} onChangeText={setName} placeholder='e.g. Samsung 55" TV' error={tried ? errors.name : null} size="lg" testID="item-name" />
      <Field label="Room">
        <ChipRow options={ROOMS.map((r) => ({ key: r, label: r, icon: ROOM_ICON[r] }))} value={room} onChange={setRoom} testIDPrefix="item-room" />
      </Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <MoneyInput label="Paid (₦)" value={price} onChange={(v) => { setPrice(v); if (value == null || value === price) setValue(v); }} testID="item-price" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <MoneyInput label="Worth now (₦)" value={value} onChange={setValue} testID="item-value" />
        </View>
      </View>
      <DateField label="Bought on (optional)" value={purchasedAt} onChange={setPurchasedAt} allowClear quick="past" testID="item-purchased" />
      <DateField label="Warranty until (optional)" value={warranty} onChange={setWarranty} allowClear icon="shield-checkmark" helper="We remind you before it runs out." testID="item-warranty" />
      {warranty ? (
        <Field label="Warranty reminders">
          <ReminderChips value={warrantyReminders} onChange={setWarrantyReminders} options={WARRANTY_OPTS} testIDPrefix="item-remind" />
        </Field>
      ) : null}
      <Pressable onPress={() => setMore((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: more }} hitSlop={8} testID="item-more">
        <AppText variant="caption" tone="brand">
          {more ? "Hide details" : "More details (brand, model, serial, store, notes)"}
        </AppText>
      </Pressable>
      {more ? (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Input label="Brand" value={brand} onChangeText={setBrand} placeholder="Samsung" containerStyle={{ flex: 1 }} testID="item-brand" />
            <Input label="Model" value={model} onChangeText={setModel} placeholder="QN55" containerStyle={{ flex: 1 }} testID="item-model" />
          </View>
          <Input label="Serial number" value={serial} onChangeText={setSerial} placeholder="On the sticker at the back" autoCapitalize="characters" testID="item-serial" />
          <Input label="Bought from" value={store} onChangeText={setStore} placeholder="e.g. Slot, Jumia, Computer Village" testID="item-store" />
          <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Anything worth remembering" multiline numberOfLines={3} testID="item-notes" />
        </View>
      ) : null}
      <AttachSheet
        visible={attach}
        onClose={() => setAttach(false)}
        title="Item photo"
        photosOnly
        onPicked={async (o) => {
          setPreview(o.previewUri);
          setProgress(0);
          try {
            setPhoto(await uploadFile(o.input, setProgress));
          } catch (e: any) {
            setPreview(null);
            toast.error("Upload failed", e?.message ?? "Check your connection and try again.");
          } finally {
            setProgress(null);
          }
        }}
      />
    </FormShell>
  );
}
