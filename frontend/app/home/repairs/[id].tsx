/**
 * Repair detail — status, "Mark done" (date, cost, notes, photos → history), Book a FIXA pro on this trade,
 * the linked item, history with costs and photos, edit / delete.
 */
import React, { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, uploadFile, type FileRef, type Repair } from "@/src/lib/homeHub";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, EmptyState, Input, ListRow, RowGroup, Screen, ScreenHeader, Section, Sheet, SkeletonRows, useCelebrate, useToast } from "@/src/ui";
import { Fact, FileThumb, StatusPill, TRADE_ICON, dueText, fmtDate, naira, useSections, useStatusMeta } from "@/src/components/home/HomeBits";
import { MoneyInput } from "@/src/components/home/FormBits";
import { AttachSheet } from "@/src/components/home/AttachSheet";
import { DateField } from "@/src/components/home/Calendar";

export default function RepairDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const sections = useSections();
  const statusMeta = useStatusMeta();
  const [rep, setRep] = useState<Repair | null>(null);
  const [missing, setMissing] = useState(false);
  const [doneSheet, setDoneSheet] = useState(false);
  const [attach, setAttach] = useState(false);
  const [doneDate, setDoneDate] = useState<string | null>(dayjs().format("YYYY-MM-DD"));
  const [cost, setCost] = useState<number | null>(null);
  const [provider, setProvider] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<FileRef[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setRep(await homeApi.repair(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else toast.error("Couldn't load this repair");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openDone = () => {
    setDoneDate(dayjs().format("YYYY-MM-DD"));
    setCost(null);
    setProvider(rep?.provider?.name ?? "");
    setNote("");
    setPhotos([]);
    setDoneSheet(true);
  };

  const markDone = async () => {
    if (!rep) return;
    setBusy(true);
    try {
      await homeApi.repairDone(rep.id, { date: doneDate ?? undefined, cost, notes: note.trim() || undefined, photos, provider_name: provider.trim() || undefined });
      setDoneSheet(false);
      celebrate({ title: "Done!", tone: "success", icon: "checkmark-done" });
      notifyBadges();
      homeHubSignal.bump();
      await load();
    } catch (e: any) {
      toast.error("Couldn't save", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDel = (title: string, body: string, go: () => void) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) go();
      return;
    }
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: go },
    ]);
  };

  const remove = () =>
    confirmDel("Delete this repair?", "Its history goes too. Photos stay in Records.", async () => {
      try {
        await homeApi.deleteRepair(rep!.id);
        toast.success("Repair deleted");
        homeHubSignal.bump();
        notifyBadges();
        if (router.canGoBack()) router.back();
        else router.replace("/home/repairs" as any);
      } catch (e: any) {
        toast.error("Couldn't delete", e?.message);
      }
    });

  const removeLog = (logId: string) =>
    confirmDel("Remove this entry?", "The cost comes off the total.", async () => {
      try {
        await homeApi.deleteRepairLog(rep!.id, logId);
        await load();
      } catch (e: any) {
        toast.error("Couldn't remove", e?.message);
      }
    });

  if (missing)
    return (
      <Screen testID="repair-missing">
        <ScreenHeader title="Repair" onBack={() => router.back()} />
        <EmptyState title="This repair is gone" body="It may have been deleted on another device." actionLabel="Back to repairs" onAction={() => router.replace("/home/repairs" as any)} />
      </Screen>
    );
  if (!rep)
    return (
      <Screen testID="repair-loading">
        <ScreenHeader title="Repair" onBack={() => router.back()} />
        <SkeletonRows rows={6} />
      </Screen>
    );

  const m = statusMeta(rep.status, rep.days_until);
  const active = rep.status !== "done" && rep.status !== "none";
  const fixaParams = { category: rep.trade === "Other" || rep.trade === "Handyman" ? "" : rep.trade };

  return (
    <Screen testID="repair-detail-screen">
      <ScreenHeader title={rep.title} subtitle={`${rep.trade} · ${rep.schedule_label}`} onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/repairs" as any))} right={<Button label="Edit" size="sm" variant="secondary" iconLeft="create-outline" onPress={() => router.push({ pathname: "/home/repairs/new", params: { id: rep.id } } as any)} testID="repair-edit" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 140, gap: space[4] }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: active ? m.soft : sections.repairs.soft }]} testID="repair-hero">
          <View style={[styles.heroIcon, { backgroundColor: active ? m.color : sections.repairs.color }]}>
            <Ionicons name={TRADE_ICON[rep.trade] ?? "construct"} size={30} color={active ? m.onColor : "#FFFFFF"} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <StatusPill status={rep.status} daysUntil={rep.days_until} testID="repair-status" />
            <AppText variant="bodySm" tone="secondary">
              {rep.next_due ? `Next ${dueText(rep.next_due)} · ${fmtDate(rep.next_due, true)}` : rep.last_done_at ? `Last done ${fmtDate(rep.last_done_at, true)}` : "No date set"}
            </AppText>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Button label="Mark done" size="lg" fullWidth variant="primary" iconLeft="checkmark-done" onPress={openDone} testID="repair-mark-done" />
          <Button label={`Book a FIXA pro · ${rep.trade}`} size="lg" fullWidth variant="fix" iconLeft="hammer" onPress={() => router.push({ pathname: "/fixa", params: fixaParams } as any)} testID="repair-book-fixa" />
        </View>

        <Card elevation="xs" style={{ gap: 2 }}>
          <Fact icon="repeat" label="Repeats" value={rep.schedule_label} />
          <Fact icon="notifications-outline" label="Reminders" value={rep.reminders.length ? rep.reminders.map((d) => (d === 0 ? "on the day" : `${d}d before`)).join(" · ") : "Off"} />
          <Fact icon="checkmark-done-outline" label="Done" value={rep.done_count ? `${rep.done_count} time${rep.done_count === 1 ? "" : "s"} · ${naira(rep.total_cost) || "₦0"} spent` : null} />
          <Fact icon="chatbox-ellipses-outline" label="Notes" value={rep.notes} />
        </Card>

        {rep.item ? (
          <RowGroup title="For">
            <ListRow icon="cube" iconTone="info" label={rep.item.name} caption={rep.item.room} onPress={() => router.push(`/home/items/${rep.item!.id}` as any)} last testID="repair-item" />
          </RowGroup>
        ) : null}

        <Section title="History" caption={rep.logs?.length ? `${rep.logs.length} entr${rep.logs.length === 1 ? "y" : "ies"}` : "Nothing logged yet"} actionLabel="Add entry" onAction={openDone}>
          {rep.logs?.length ? (
            <View style={{ gap: 10 }}>
              {rep.logs.map((lg) => (
                <Card key={lg.id} elevation="xs" style={{ gap: 8 }} testID={`repair-log-${lg.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[styles.logDot, { backgroundColor: colors.successSoft }]}>
                      <Ionicons name="checkmark" size={16} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyMedium">{fmtDate(lg.date, true)}</AppText>
                      <AppText variant="caption" tone="secondary">
                        {[lg.cost != null ? naira(lg.cost) : null, lg.provider_name].filter(Boolean).join(" · ") || "No cost recorded"}
                      </AppText>
                    </View>
                    <Pressable onPress={() => removeLog(lg.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove entry" testID={`repair-log-remove-${lg.id}`}>
                      <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  {lg.notes ? (
                    <AppText variant="bodySm" tone="secondary">
                      {lg.notes}
                    </AppText>
                  ) : null}
                  {lg.photos?.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {lg.photos.map((p, i) => (
                        <FileThumb key={i} file={p} size={72} radius={radii.md} />
                      ))}
                    </ScrollView>
                  ) : null}
                </Card>
              ))}
            </View>
          ) : (
            <AppText variant="bodySm" tone="tertiary">
              Each time you mark it done, the date, cost and photos land here — handy when you sell or hand over the home.
            </AppText>
          )}
        </Section>

        <Button label="Delete repair" variant="destructive" iconLeft="trash-outline" onPress={remove} testID="repair-delete" />
      </ScrollView>

      <Sheet visible={doneSheet} onClose={() => !busy && setDoneSheet(false)} title="Mark as done" testID="repair-done-sheet">
        <View style={{ gap: 16 }}>
          <DateField label="Done on" value={doneDate} onChange={setDoneDate} quick="past" testID="done-date" />
          <MoneyInput label="Cost (₦, optional)" value={cost} onChange={setCost} testID="done-cost" />
          <Input label="Who did it? (optional)" value={provider} onChangeText={setProvider} placeholder="e.g. Engr. Adebayo (FIXA)" testID="done-provider" />
          <Input label="Notes (optional)" value={note} onChangeText={setNote} placeholder="What was done, parts replaced…" testID="done-note" />
          <View style={{ gap: 8 }}>
            <AppText variant="label" tone="secondary" uppercase>
              Photos (optional)
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((p, i) => (
                <FileThumb key={i} file={p} size={64} radius={radii.md} />
              ))}
              <Pressable onPress={() => setAttach(true)} disabled={progress != null} accessibilityRole="button" accessibilityLabel="Add a photo" style={[styles.addPhoto, { borderColor: colors.border }]} testID="done-add-photo">
                <Ionicons name={progress != null ? "cloud-upload-outline" : "camera"} size={22} color={colors.textSecondary} />
                <AppText variant="micro" tone="secondary">
                  {progress != null ? `${Math.round(progress * 100)}%` : "Add"}
                </AppText>
              </Pressable>
            </ScrollView>
          </View>
          <Button label="Save to history" size="lg" fullWidth loading={busy} disabled={progress != null} iconLeft="checkmark" onPress={markDone} testID="done-confirm" />
          {rep.schedule.freq !== "once" ? (
            <AppText variant="micro" tone="tertiary" align="center">
              The next due date restarts from the day it was done.
            </AppText>
          ) : null}
        </View>
      </Sheet>
      <AttachSheet
        visible={attach}
        onClose={() => setAttach(false)}
        title="Repair photo"
        photosOnly
        onPicked={async (o) => {
          setProgress(0);
          try {
            const f = await uploadFile(o.input, setProgress);
            setPhotos((p) => [...p, f]);
          } catch (e: any) {
            toast.error("Upload failed", e?.message ?? "Check your connection and try again.");
          } finally {
            setProgress(null);
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radii.xl },
  heroIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  logDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  addPhoto: { width: 64, height: 64, borderRadius: radii.md, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
});
