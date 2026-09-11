import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { api, MarketplaceItem } from "@/src/lib/api";
import { colors, radius, spacing, formatNaira, shadows } from "@/src/constants/theme";

export type BookingSheetRef = {
  open: (item: MarketplaceItem) => void;
  close: () => void;
};

const TIME_SLOTS = ["Morning (8–12)", "Afternoon (12–4)", "Evening (4–7)"];

function nextDates(count: number = 7) {
  const out: { key: string; label: string; sub: string }[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.toLocaleDateString("en-US", { weekday: "short" });
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dow;
    const sub = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    out.push({ key: iso, label, sub });
  }
  return out;
}

export const BookingSheet = forwardRef<BookingSheetRef, object>((_, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [dateKey, setDateKey] = useState<string>("");
  const [timeSlot, setTimeSlot] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useImperativeHandle(ref, () => ({
    open: (it) => {
      setItem(it);
      setName("");
      setPhone("");
      setAddress("");
      setNotes("");
      const dates = nextDates(7);
      setDateKey(dates[1]?.key || dates[0].key); // default tomorrow
      setTimeSlot(TIME_SLOTS[0]);
      setConfirmed(false);
      sheetRef.current?.present();
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["90%"], []);
  const dates = useMemo(() => nextDates(7), []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.45} />
    ),
    []
  );

  const submit = async () => {
    if (!item) return;
    if (!name.trim() || !phone.trim() || !address.trim()) {
      Alert.alert("Missing details", "Please fill in your name, phone and address.");
      return;
    }
    if (!dateKey || !timeSlot) {
      Alert.alert("Choose a slot", "Pick a preferred date and time window.");
      return;
    }
    setSending(true);
    try {
      await api.fixaBook({
        item_id: item.id,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        address: address.trim(),
        scheduled_date: dateKey,
        scheduled_time: timeSlot,
        notes: notes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConfirmed(true);
      setTimeout(() => sheetRef.current?.dismiss(), 1600);
    } catch (e: any) {
      Alert.alert("Booking failed", e?.message || "Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#fff" }}
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView style={{ flex: 1 }}>
        {!item ? (
          <View style={styles.loading}><ActivityIndicator color={colors.red} /></View>
        ) : confirmed ? (
          <View style={styles.confirmed} testID="fixa-booking-confirmed">
            <View style={styles.confirmedIcon}>
              <Ionicons name="checkmark" size={32} color="#fff" />
            </View>
            <Text style={styles.confirmedTitle}>Booking sent!</Text>
            <Text style={styles.confirmedBody}>
              {item.seller_name} will reach out shortly to confirm.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Provider header */}
            <View style={styles.hdr}>
              <Image
                source={{ uri: item.seller_avatar }}
                style={styles.hdrAvatar}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <View style={styles.hdrTitleRow}>
                  <Text style={styles.hdrName} numberOfLines={1}>{item.seller_name || item.vendor}</Text>
                  {item.is_fixa_verified && (
                    <View style={styles.verifyPill}>
                      <Ionicons name="shield-checkmark" size={11} color="#15803D" />
                      <Text style={styles.verifyPillText}>FIXA</Text>
                    </View>
                  )}
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.trade}>{item.subcategory}</Text>
                  <View style={styles.dot} />
                  <Ionicons name="star" size={11} color="#F5B301" />
                  <Text style={styles.metaStrong}>{(item.seller_rating ?? item.rating).toFixed(1)}</Text>
                  <Text style={styles.meta}>({item.seller_reviews ?? item.reviews})</Text>
                </View>
                <Text style={styles.priceLine}>From <Text style={styles.priceBold}>{formatNaira(item.price)}</Text></Text>
              </View>
            </View>

            {/* Section: Date */}
            <Text style={styles.sectionTitle}>Preferred Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
              {dates.map((d) => {
                const active = dateKey === d.key;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setDateKey(d.key);
                    }}
                    style={[styles.dateTile, active && styles.dateTileActive]}
                    testID={`fixa-date-${d.key}`}
                  >
                    <Text style={[styles.dateLabel, active && { color: "#fff" }]}>{d.label}</Text>
                    <Text style={[styles.dateSub, active && { color: "rgba(255,255,255,0.85)" }]}>{d.sub}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Section: Time */}
            <Text style={styles.sectionTitle}>Time Window</Text>
            <View style={styles.timeRow}>
              {TIME_SLOTS.map((slot) => {
                const active = timeSlot === slot;
                return (
                  <Pressable
                    key={slot}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setTimeSlot(slot);
                    }}
                    style={[styles.timeChip, active && styles.timeChipActive]}
                  >
                    <Text style={[styles.timeChipText, active && { color: "#fff" }]}>{slot}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Section: Contact */}
            <Text style={styles.sectionTitle}>Your Details</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              testID="fixa-input-name"
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              style={styles.input}
              testID="fixa-input-phone"
            />
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Service address"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              testID="fixa-input-address"
            />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes for the pro (optional)"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[styles.input, styles.inputMulti]}
              testID="fixa-input-notes"
            />

            <View style={styles.trustRow}>
              <Ionicons name="shield-checkmark" size={14} color="#22C55E" />
              <Text style={styles.trustText}>
                FIXA-verified pro — background-checked, rated, insured.
              </Text>
            </View>

            <Pressable
              onPress={submit}
              style={[styles.submitBtn, sending && { opacity: 0.7 }]}
              disabled={sending}
              testID="fixa-submit-booking"
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Send Booking Request</Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

BookingSheet.displayName = "BookingSheet";

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, paddingBottom: 40, gap: 4 },

  // Header
  hdr: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: 16,
  },
  hdrAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface },
  hdrTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  hdrName: { fontSize: 15, fontWeight: "800", color: colors.text, letterSpacing: -0.2, flex: 1 },
  verifyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  verifyPillText: { fontSize: 9, fontWeight: "900", color: "#15803D", letterSpacing: 0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  trade: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },
  meta: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  metaStrong: { fontSize: 11, color: colors.text, fontWeight: "800" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 3 },
  priceLine: { fontSize: 11, color: colors.textTertiary, fontWeight: "600", marginTop: 4 },
  priceBold: { color: colors.text, fontWeight: "900", fontSize: 13 },

  // Sections
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.1,
    marginTop: 12,
    marginBottom: 8,
  },

  // Date row
  dateRow: { gap: 8, paddingBottom: 4 },
  dateTile: {
    minWidth: 68,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 2,
  },
  dateTileActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  dateLabel: { fontSize: 12, fontWeight: "800", color: colors.text },
  dateSub: { fontSize: 10, color: colors.textTertiary, fontWeight: "600" },

  // Time row
  timeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  timeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  timeChipText: { fontSize: 12, fontWeight: "700", color: colors.text },

  // Inputs
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 10,
  },
  inputMulti: { minHeight: 76, textAlignVertical: "top" },

  // Trust row
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.2)",
  },
  trustText: { flex: 1, fontSize: 11, color: "#15803D", fontWeight: "700" },

  // Submit
  submitBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.2 },

  // Confirmed
  confirmed: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  confirmedIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#22C55E",
    alignItems: "center", justifyContent: "center",
  },
  confirmedTitle: { fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.4 },
  confirmedBody: { fontSize: 14, color: colors.textSecondary, fontWeight: "500", textAlign: "center", lineHeight: 20 },
});
