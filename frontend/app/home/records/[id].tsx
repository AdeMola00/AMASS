/**
 * Record detail — the file big and readable (image inline, PDF opens / shares), expiry state, links to the
 * bill / item / repair it belongs to, edit and delete.
 */
import React, { useCallback, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, type HomeRecord } from "@/src/lib/homeHub";
import { openPrivateFile } from "@/src/lib/homeFiles";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, EmptyState, ListRow, RowGroup, Screen, ScreenHeader, SkeletonRows, useToast } from "@/src/ui";
import { FOLDER_ICON, Fact, FileThumb, RECORD_FOLDERS, StatusPill, expiryPill, fmtDate } from "@/src/components/home/HomeBits";

export default function RecordDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const [rec, setRec] = useState<HomeRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setRec(await homeApi.record(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else toast.error("Couldn't load this record");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = async () => {
    if (!rec?.file) return;
    setOpening(true);
    try {
      await openPrivateFile(rec.file);
    } catch (e: any) {
      toast.error("Couldn't open the file", e?.message ?? "Please try again.");
    } finally {
      setOpening(false);
    }
  };

  const remove = () => {
    const go = async () => {
      try {
        await homeApi.deleteRecord(rec!.id);
        toast.success("Record deleted");
        homeHubSignal.bump();
        if (router.canGoBack()) router.back();
        else router.replace("/home/records" as any);
      } catch (e: any) {
        toast.error("Couldn't delete", e?.message);
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this record? The file is removed from your Records.")) go();
      return;
    }
    Alert.alert("Delete this record?", "The file is removed from your Records.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: go },
    ]);
  };

  if (missing)
    return (
      <Screen testID="record-missing">
        <ScreenHeader title="Record" onBack={() => router.back()} />
        <EmptyState title="This record is gone" body="It may have been deleted on another device." actionLabel="Back to records" onAction={() => router.replace("/home/records" as any)} />
      </Screen>
    );
  if (!rec)
    return (
      <Screen testID="record-loading">
        <ScreenHeader title="Record" onBack={() => router.back()} />
        <SkeletonRows rows={5} />
      </Screen>
    );

  const folderLabel = RECORD_FOLDERS.find((f) => f.key === rec.folder)?.label ?? rec.folder;
  const isImage = !!rec.file?.content_type?.startsWith("image/");

  return (
    <Screen testID="record-detail-screen">
      <ScreenHeader title={rec.title} subtitle={folderLabel} onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/records" as any))} right={<Button label="Edit" size="sm" variant="secondary" iconLeft="create-outline" onPress={() => router.push({ pathname: "/home/records/new", params: { id: rec.id } } as any)} testID="record-edit" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} showsVerticalScrollIndicator={false}>
        <View style={[styles.viewer, { backgroundColor: colors.surfaceAlt }]} testID="record-viewer">
          {rec.file ? (
            <FileThumb file={rec.file} size="fill" radius={radii.xl} style={{ height: isImage ? 320 : 180 }} />
          ) : (
            <View style={styles.noFile}>
              <Ionicons name="image-outline" size={40} color={colors.textMuted} />
              <AppText variant="bodySm" tone="secondary" align="center">
                No file attached yet
              </AppText>
            </View>
          )}
        </View>
        {rec.file ? (
          <Button label={isImage ? "Open full size" : "Open / share file"} size="lg" fullWidth variant="primary" iconLeft={isImage ? "expand-outline" : "open-outline"} loading={opening} onPress={open} testID="record-open" />
        ) : (
          <Button label="Attach a file" size="lg" fullWidth variant="primary" iconLeft="camera-outline" onPress={() => router.push({ pathname: "/home/records/new", params: { id: rec.id } } as any)} testID="record-attach-now" />
        )}

        {rec.expires_at ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <StatusPill {...expiryPill(rec.expiry_status, rec.days_until_expiry)} testID="record-expiry" />
            <AppText variant="caption" tone="secondary">
              {rec.expiry_status === "expired" ? "Expired" : "Expires"} {fmtDate(rec.expires_at, true)}
            </AppText>
          </View>
        ) : null}

        <Card elevation="xs" style={{ gap: 2 }}>
          <Fact icon={FOLDER_ICON[rec.folder] ?? "folder"} label="Folder" value={folderLabel} />
          <Fact icon="calendar-outline" label="Added" value={fmtDate(rec.created_at, true)} />
          <Fact icon="document-outline" label="File" value={rec.file ? `${rec.file.name || "file"}${rec.file.size ? ` · ${(rec.file.size / 1024 / 1024).toFixed(rec.file.size > 1024 * 1024 ? 1 : 2)} MB` : ""}` : null} />
          <Fact icon="notifications-outline" label="Reminders" value={rec.expires_at && rec.expiry_reminders.length ? rec.expiry_reminders.map((d) => (d === 0 ? "on the day" : `${d}d before`)).join(" · ") : null} />
          <Fact icon="chatbox-ellipses-outline" label="Notes" value={rec.notes} />
        </Card>

        {rec.bill || rec.item || rec.repair ? (
          <RowGroup title="Linked to">
            {rec.bill ? <ListRow icon="receipt" iconTone="info" label={rec.bill.name} caption="Bill" onPress={() => router.push(`/home/bills/${rec.bill!.id}` as any)} last={!rec.item && !rec.repair} testID="record-linked-bill" /> : null}
            {rec.item ? <ListRow icon="cube" iconTone="info" label={rec.item.name} caption="Item" onPress={() => router.push(`/home/items/${rec.item!.id}` as any)} last={!rec.repair} testID="record-linked-item" /> : null}
            {rec.repair ? <ListRow icon="hammer" iconTone="brand" label={rec.repair.title} caption="Repair" onPress={() => router.push(`/home/repairs/${rec.repair!.id}` as any)} last testID="record-linked-repair" /> : null}
          </RowGroup>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
          <AppText variant="micro" tone="tertiary" style={{ flex: 1 }}>
            Only you can open this file. It is never shared with agents, neighbours or providers.
          </AppText>
        </View>
        <Button label="Delete record" variant="destructive" iconLeft="trash-outline" onPress={remove} testID="record-delete" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewer: { borderRadius: radii.xl, overflow: "hidden" },
  noFile: { height: 180, alignItems: "center", justifyContent: "center", gap: 8 },
});
