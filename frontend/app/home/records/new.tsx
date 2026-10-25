/**
 * Add / edit a record: attach a photo or PDF (private, resumable upload), pick a folder, optional expiry with
 * reminders, and link it to a bill / item / repair. Three taps: + → Record → attach → Save.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import dayjs from "dayjs";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, newId, saveOrQueue, uploadFile, withRetry, type Bill, type FileRef, type RecordIn } from "@/src/lib/homeHub";
import { AppText, Badge, Chip, Input, Screen, Sheet, SkeletonRows, useToast } from "@/src/ui";
import { BILL_ICON, ChipRow, FOLDER_ICON, RECORD_FOLDERS, naira } from "@/src/components/home/HomeBits";
import { DateField } from "@/src/components/home/Calendar";
import { AttachmentTile, Field, FormShell, HomePicker, ReminderChips } from "@/src/components/home/FormBits";
import { AttachSheet } from "@/src/components/home/AttachSheet";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

const EXPIRY_OPTS = [
  { key: 0, label: "On the day" },
  { key: 7, label: "1 week before" },
  { key: 30, label: "1 month before" },
  { key: 90, label: "3 months before" },
];

export default function RecordForm() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string; home_id?: string; folder?: string; bill_id?: string; item_id?: string; repair_id?: string; title?: string }>();
  const editing = !!params.id;
  const { homes, homeId: selectedId, ready } = useSelectedHome();

  const [homeId, setHomeId] = useState<string | null>(params.home_id || null);
  const [title, setTitle] = useState(params.title ?? "");
  const [folder, setFolder] = useState(params.folder || "receipts");
  const [customFolder, setCustomFolder] = useState("");
  const [file, setFile] = useState<FileRef | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [attach, setAttach] = useState(false);
  const [expires, setExpires] = useState<string | null>(null);
  const [expiryReminders, setExpiryReminders] = useState<number[]>([30, 7, 0]);
  const [billId, setBillId] = useState<string | null>(params.bill_id || null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billSheet, setBillSheet] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!homeId && ready && selectedId && selectedId !== "all") setHomeId(selectedId);
    if (!homeId && ready && (!selectedId || selectedId === "all") && homes[0]) setHomeId(homes.find((h) => h.is_default)?.id ?? homes[0].id);
  }, [ready, selectedId, homes, homeId]);
  useEffect(() => {
    if (homeId) homeApi.bills({ home_id: homeId, include_archived: true }).then((r) => setBills(r.items)).catch(() => {});
  }, [homeId]);
  useEffect(() => {
    if (!params.id) return;
    homeApi
      .record(params.id)
      .then((r) => {
        setHomeId(r.home_id);
        setTitle(r.title);
        if (RECORD_FOLDERS.some((f) => f.key === r.folder)) setFolder(r.folder);
        else {
          setFolder("custom");
          setCustomFolder(r.folder);
        }
        setFile(r.file ?? null);
        setExpires(r.expires_at ?? null);
        if (r.expiry_reminders?.length) setExpiryReminders(r.expiry_reminders);
        setBillId(r.bill_id ?? null);
        setNotes(r.notes ?? "");
      })
      .catch(() => toast.error("Couldn't load this record"))
      .finally(() => setLoading(false));
  }, [params.id, toast]);

  const folderKey = folder === "custom" ? customFolder.trim() : folder;
  const errors = useMemo(() => ({ title: !title.trim() ? "Give it a name" : null, folder: !folderKey ? "Name the folder" : null, home: !homeId ? "Pick a home" : null }), [title, folderKey, homeId]);
  const valid = !errors.title && !errors.folder && !errors.home;
  const uploading = progress != null && progress < 1;
  const linkedBill = bills.find((b) => b.id === billId);

  const save = async () => {
    setTried(true);
    if (!valid || !homeId || uploading) return;
    setSaving(true);
    const body: RecordIn = { home_id: homeId, title: title.trim(), folder: folderKey, file, notes: notes.trim() || null, expires_at: expires, expiry_reminders: expires ? expiryReminders : [], bill_id: billId, item_id: params.item_id || null, repair_id: params.repair_id || null };
    try {
      if (editing && params.id) {
        await withRetry(() => homeApi.updateRecord(params.id!, body));
        toast.success("Record updated");
      } else {
        const id = newId();
        const out = await saveOrQueue({ id, kind: "record", body: { ...body, id }, title: body.title }, () => homeApi.createRecord({ ...body, id }));
        if (out.saved) toast.success("Saved to Records", file ? "Stored privately — only you can open it." : "You can attach the file later.");
        else toast.info("Saved on this phone", "It will sync as soon as you're back online.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      homeHubSignal.bump();
      if (router.canGoBack()) router.back();
      else router.replace("/home/records" as any);
    } catch (e: any) {
      toast.error("Couldn't save", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Screen testID="record-form-loading">
        <SkeletonRows rows={6} />
      </Screen>
    );

  return (
    <FormShell title={editing ? "Edit record" : "New record"} subtitle="Receipts, agreements, documents, warranties" onSave={save} saveLabel={editing ? "Save changes" : "Save record"} saving={saving} disabled={uploading} testID="record-form" footerNote="Files are private to your account">
      <HomePicker homes={homes} value={homeId} onChange={setHomeId} />
      <AttachmentTile
        file={file}
        previewUri={preview}
        progress={progress}
        label="Add the photo or file"
        onAdd={() => setAttach(true)}
        onRemove={() => {
          setFile(null);
          setPreview(null);
        }}
        testID="record-attach"
      />
      <Field label="Folder">
        <ChipRow options={[...RECORD_FOLDERS.map((f) => ({ key: f.key, label: f.label, icon: FOLDER_ICON[f.key] })), { key: "custom", label: "New folder…", icon: "add" }]} value={folder} onChange={setFolder} testIDPrefix="record-folder" />
        {folder === "custom" ? <Input value={customFolder} onChangeText={setCustomFolder} placeholder="Folder name, e.g. Insurance" error={tried ? errors.folder : null} testID="record-folder-custom" /> : null}
      </Field>
      <Input label="Name" value={title} onChangeText={setTitle} placeholder={folder === "receipts" ? "e.g. NEPA receipt · June" : "e.g. Tenancy agreement 2026"} error={tried ? errors.title : null} size="lg" testID="record-title" />
      <DateField label="Expires (optional)" value={expires} onChange={setExpires} allowClear helper="Agreements, insurance and warranties — we remind you before they lapse." testID="record-expires" />
      {expires ? (
        <Field label="Expiry reminders">
          <ReminderChips value={expiryReminders} onChange={setExpiryReminders} options={EXPIRY_OPTS} testIDPrefix="record-remind" />
        </Field>
      ) : null}
      <Field label="Linked bill (optional)">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {linkedBill ? (
            <Pressable onPress={() => setBillSheet(true)} accessibilityRole="button" accessibilityLabel={`Linked to ${linkedBill.name}. Change`} testID="record-link-bill">
              <Badge label={`${linkedBill.name}${linkedBill.amount ? ` · ${naira(linkedBill.amount)}` : ""}`} tone="info" icon={BILL_ICON[linkedBill.category] ?? "receipt"} />
            </Pressable>
          ) : (
            <Chip label="Link to a bill" icon="link" onPress={() => setBillSheet(true)} testID="record-link-bill" />
          )}
          {linkedBill ? (
            <Pressable onPress={() => setBillId(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Unlink bill" testID="record-unlink-bill">
              <AppText variant="caption" tone="error">
                Unlink
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </Field>
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Anything worth remembering" multiline numberOfLines={3} testID="record-notes" />

      <AttachSheet
        visible={attach}
        onClose={() => setAttach(false)}
        onPicked={async (o) => {
          setPreview(o.previewUri);
          setProgress(0);
          if (!title.trim() && o.input.name) setTitle(o.input.name.replace(/\.[a-z0-9]+$/i, "").replace(/^photo-\d+$/, `${RECORD_FOLDERS.find((f) => f.key === folder)?.label ?? "Record"} · ${dayjs().format("D MMM")}`));
          try {
            setFile(await uploadFile(o.input, setProgress));
          } catch (e: any) {
            setPreview(null);
            toast.error("Upload failed", e?.message ?? "Check your connection and try again.");
          } finally {
            setProgress(null);
          }
        }}
      />
      <Sheet visible={billSheet} onClose={() => setBillSheet(false)} title="Link to a bill" testID="record-bill-sheet">
        <View style={{ gap: 8 }}>
          {bills.length ? (
            bills.map((b) => (
              <Chip key={b.id} label={`${b.name}${b.amount ? ` · ${naira(b.amount)}` : ""}`} icon={BILL_ICON[b.category] ?? "receipt"} selected={billId === b.id} onPress={() => { setBillId(b.id); if (folder !== "custom") setFolder("receipts"); setBillSheet(false); }} testID={`record-bill-${b.id}`} />
            ))
          ) : (
            <AppText variant="bodySm" tone="secondary">
              No bills for this home yet. Add a bill first, then link its receipts here.
            </AppText>
          )}
        </View>
      </Sheet>
    </FormShell>
  );
}
