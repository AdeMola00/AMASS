/**
 * Bill detail — big status header, Mark paid (optionally with a receipt photo), payment history with undo,
 * linked receipts, schedule & reminders, edit / archive / delete.
 */
import React, { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, uploadFile, type BillDetail, type FileRef } from "@/src/lib/homeHub";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Section, Sheet, SkeletonRows, useCelebrate, useToast } from "@/src/ui";
import { BILL_CATEGORIES, BILL_ICON, Fact, FileThumb, StatusPill, dueText, fmtDate, naira, useStatusMeta } from "@/src/components/home/HomeBits";
import { AttachmentTile, MoneyInput } from "@/src/components/home/FormBits";
import { AttachSheet } from "@/src/components/home/AttachSheet";
import { DateField } from "@/src/components/home/Calendar";

function confirm(title: string, body: string, onYes: () => void, yesLabel = "Delete") {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) onYes();
    return;
  }
  Alert.alert(title, body, [
    { text: "Cancel", style: "cancel" },
    { text: yesLabel, style: "destructive", onPress: onYes },
  ]);
}

export default function BillDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const statusMeta = useStatusMeta();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [paySheet, setPaySheet] = useState(false);
  const [attach, setAttach] = useState(false);
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [payDate, setPayDate] = useState<string | null>(dayjs().format("YYYY-MM-DD"));
  const [payNote, setPayNote] = useState("");
  const [receipt, setReceipt] = useState<FileRef | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const b = await homeApi.bill(id);
      setBill(b);
      setPayAmount(b.amount || null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else toast.error("Couldn't load this bill");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openPay = () => {
    setPayAmount(bill?.amount || null);
    setPayDate(dayjs().format("YYYY-MM-DD"));
    setPayNote("");
    setReceipt(null);
    setPreview(null);
    setPaySheet(true);
  };

  const markPaid = async () => {
    if (!bill) return;
    setBusy(true);
    try {
      await homeApi.payBill(bill.id, { amount: payAmount, paid_at: payDate ? dayjs(payDate).hour(12).toISOString() : undefined, note: payNote.trim() || undefined, receipt });
      setPaySheet(false);
      celebrate({ title: "Paid!", tone: "success", icon: "checkmark" });
      notifyBadges();
      homeHubSignal.bump();
      await load();
    } catch (e: any) {
      toast.error("Couldn't mark it paid", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const undo = (paymentId: string) =>
    confirm("Undo this payment?", "The bill goes back to its previous due date. Any attached receipt stays in Records.", async () => {
      try {
        await homeApi.undoPayment(bill!.id, paymentId);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        notifyBadges();
        homeHubSignal.bump();
        await load();
      } catch (e: any) {
        toast.error("Couldn't undo", e?.message);
      }
    }, "Undo");

  const archive = async () => {
    if (!bill) return;
    try {
      await homeApi.archiveBill(bill.id, bill.archived);
      toast.success(bill.archived ? "Bill restored" : "Bill archived", bill.archived ? undefined : "It stops reminding you. Restore it any time.");
      homeHubSignal.bump();
      notifyBadges();
      await load();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    }
  };

  const remove = () =>
    confirm("Delete this bill?", "Its payment history goes too. Receipts stay in Records.", async () => {
      try {
        await homeApi.deleteBill(bill!.id);
        toast.success("Bill deleted");
        homeHubSignal.bump();
        notifyBadges();
        if (router.canGoBack()) router.back();
        else router.replace("/home/bills" as any);
      } catch (e: any) {
        toast.error("Couldn't delete", e?.message);
      }
    });

  if (missing)
    return (
      <Screen testID="bill-missing">
        <ScreenHeader title="Bill" onBack={() => router.back()} />
        <EmptyState title="This bill is gone" body="It may have been deleted on another device." actionLabel="Back to bills" onAction={() => router.replace("/home/bills" as any)} />
      </Screen>
    );
  if (!bill)
    return (
      <Screen testID="bill-loading">
        <ScreenHeader title="Bill" onBack={() => router.back()} />
        <SkeletonRows rows={6} />
      </Screen>
    );

  const m = statusMeta(bill.status, bill.days_until);
  const catLabel = BILL_CATEGORIES.find((c) => c.key === bill.category)?.label ?? "Bill";
  const once = bill.schedule.freq === "once";
  const canPay = !bill.archived && !(once && bill.paid_at);

  return (
    <Screen testID="bill-detail-screen">
      <ScreenHeader title={bill.name} subtitle={`${catLabel}${bill.home ? ` · ${bill.home.name}` : ""}`} onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/bills" as any))} right={<Button label="Edit" size="sm" variant="secondary" iconLeft="create-outline" onPress={() => router.push({ pathname: "/home/bills/new", params: { id: bill.id } } as any)} testID="bill-edit" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 140, gap: space[4] }} showsVerticalScrollIndicator={false}>
        {/* Status hero */}
        <View style={[styles.hero, { backgroundColor: m.soft }]} testID="bill-hero">
          <View style={[styles.heroIcon, { backgroundColor: m.color }]}>
            <Ionicons name={BILL_ICON[bill.category] ?? "receipt"} size={30} color={m.onColor} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="priceLg" tabular testID="bill-amount-text">
              {bill.amount ? naira(bill.amount) : "Amount not set"}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusPill status={bill.status} daysUntil={bill.days_until} testID="bill-status" />
              <AppText variant="caption" tone="secondary">
                {once && bill.paid_at ? `Paid ${fmtDate(bill.paid_at)}` : `Due ${dueText(bill.next_due)} · ${fmtDate(bill.next_due, true)}`}
              </AppText>
            </View>
          </View>
        </View>

        {canPay ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Mark paid" size="lg" variant="primary" iconLeft="checkmark-circle" onPress={openPay} style={{ flex: 1.3 }} testID="bill-mark-paid" />
            <Button label="Receipt" size="lg" variant="secondary" iconLeft="camera-outline" onPress={() => router.push({ pathname: "/home/records/new", params: { home_id: bill.home_id, bill_id: bill.id, folder: "receipts", title: `${bill.name} receipt` } } as any)} style={{ flex: 1 }} testID="bill-add-receipt" />
          </View>
        ) : null}

        <Card elevation="xs" style={{ gap: 2 }}>
          <Fact icon="repeat" label="Repeats" value={bill.schedule_label} />
          <Fact icon="notifications-outline" label="Reminders" value={bill.reminders.length ? bill.reminders.map((d) => (d === 0 ? "on the day" : `${d}d before`)).join(" · ") : "Off"} />
          <Fact icon="person-outline" label="Payee" value={bill.payee} />
          <Fact icon="document-text-outline" label="Notes" value={bill.notes} />
          <Fact icon="checkmark-done-outline" label="Paid" value={bill.paid_count ? `${bill.paid_count} time${bill.paid_count === 1 ? "" : "s"}${bill.last_paid_at ? ` · last ${fmtDate(bill.last_paid_at, true)}` : ""}` : null} />
        </Card>

        <Section title="Payment history" caption={bill.payments.length ? `${bill.payments.length} payment${bill.payments.length === 1 ? "" : "s"}` : "Nothing marked paid yet"}>
          {bill.payments.length ? (
            <Card elevation="xs" padded={false}>
              {bill.payments.map((p, i) => {
                const rec = bill.records.find((r) => r.id === p.record_id);
                return (
                  <View key={p.id} style={[styles.payRow, i < bill.payments.length - 1 && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]} testID={`bill-payment-${p.id}`}>
                    <View style={[styles.payIcon, { backgroundColor: colors.successSoft }]}>
                      <Ionicons name="checkmark" size={18} color={colors.success} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="bodyMedium" tabular>
                        {naira(p.amount) || "Paid"}
                      </AppText>
                      <AppText variant="caption" tone="secondary" numberOfLines={1}>
                        {fmtDate(p.paid_at, true)}
                        {p.period_due ? ` · for ${fmtDate(p.period_due)}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </AppText>
                    </View>
                    {rec ? (
                      <Pressable onPress={() => router.push(`/home/records/${rec.id}` as any)} accessibilityRole="button" accessibilityLabel="Open receipt" hitSlop={6} testID={`bill-payment-receipt-${p.id}`}>
                        <FileThumb file={rec.file} size={40} radius={radii.sm} />
                      </Pressable>
                    ) : null}
                    {i === 0 ? (
                      <Pressable onPress={() => undo(p.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Undo this payment" testID={`bill-undo-${p.id}`}>
                        <AppText variant="caption" tone="brand">
                          Undo
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          ) : (
            <AppText variant="bodySm" tone="tertiary">
              When you mark this bill paid it shows up here with the date and any receipt.
            </AppText>
          )}
        </Section>

        <Section title="Receipts & documents" caption="Linked to this bill" actionLabel="Add" onAction={() => router.push({ pathname: "/home/records/new", params: { home_id: bill.home_id, bill_id: bill.id, folder: "receipts", title: `${bill.name} receipt` } } as any)}>
          {bill.records.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {bill.records.map((r) => (
                <Pressable key={r.id} onPress={() => router.push(`/home/records/${r.id}` as any)} accessibilityRole="button" accessibilityLabel={r.title} style={[styles.recCard, { backgroundColor: colors.surface }]} testID={`bill-record-${r.id}`}>
                  <FileThumb file={r.file} size={"fill"} radius={radii.md} style={{ height: 90, width: 120 }} />
                  <AppText variant="micro" numberOfLines={2} style={{ width: 120 }}>
                    {r.title}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <AppText variant="bodySm" tone="tertiary">
              Snap the receipt when you pay — it's stored privately and linked here.
            </AppText>
          )}
        </Section>

        <View style={{ gap: 10 }}>
          <Button label={bill.archived ? "Restore bill" : "Archive bill"} variant="secondary" iconLeft={bill.archived ? "refresh" : "archive-outline"} onPress={archive} testID="bill-archive" />
          <Button label="Delete bill" variant="destructive" iconLeft="trash-outline" onPress={remove} testID="bill-delete" />
        </View>
        {bill.archived ? <Badge label="Archived · no reminders" tone="neutral" icon="archive" /> : null}
      </ScrollView>

      {/* Mark paid sheet */}
      <Sheet visible={paySheet} onClose={() => !busy && setPaySheet(false)} title="Mark as paid" testID="bill-pay-sheet">
        <View style={{ gap: 16 }}>
          <MoneyInput label="Amount paid (₦)" value={payAmount} onChange={setPayAmount} testID="pay-amount" />
          <DateField label="Paid on" value={payDate} onChange={setPayDate} quick="past" testID="pay-date" />
          <AttachmentTile file={receipt} previewUri={preview} progress={progress} label="Attach the receipt (optional)" onAdd={() => setAttach(true)} onRemove={() => { setReceipt(null); setPreview(null); }} testID="pay-receipt" />
          <Input label="Note (optional)" value={payNote} onChangeText={setPayNote} placeholder="e.g. Paid by transfer" testID="pay-note" />
          <Button label={receipt ? "Save payment & receipt" : "Save payment"} size="lg" fullWidth loading={busy} disabled={progress != null && progress < 1} iconLeft="checkmark" onPress={markPaid} testID="pay-confirm" />
          <AppText variant="micro" tone="tertiary" align="center">
            This only records that you paid. No money moves through AMASS.
          </AppText>
        </View>
      </Sheet>
      <AttachSheet
        visible={attach}
        onClose={() => setAttach(false)}
        title="Receipt photo or file"
        onPicked={async (o) => {
          setPreview(o.previewUri);
          setProgress(0);
          try {
            const f = await uploadFile(o.input, setProgress);
            setReceipt(f);
          } catch (e: any) {
            setPreview(null);
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
  payRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  payIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  recCard: { padding: 8, borderRadius: radii.lg, gap: 6 },
});
