import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert } from "react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, MarketplaceItem } from "@/src/lib/api";
import { colors, radius, spacing, formatNaira } from "@/src/constants/theme";

export type MakeOfferSheetRef = {
  open: (item: MarketplaceItem) => void;
  close: () => void;
};

export const MakeOfferSheet = forwardRef<MakeOfferSheetRef, object>((_, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [amount, setAmount] = useState<number | undefined>();
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useImperativeHandle(ref, () => ({
    open: (it) => {
      setItem(it);
      // suggest 90%
      setAmount(Math.round(it.price * 0.9));
      setMsg("");
      setSent(false);
      sheetRef.current?.present();
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["55%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    []
  );

  const submit = async () => {
    if (!item || !amount || amount <= 0) {
      Alert.alert("Enter an offer", "Please enter a valid amount.");
      return;
    }
    setSending(true);
    try {
      await api.marketplaceMakeOffer(item.id, amount, msg.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSent(true);
      setTimeout(() => sheetRef.current?.dismiss(), 1200);
    } catch (e: any) {
      Alert.alert("Couldn't send offer", e?.message || "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const quickBumps = item
    ? [
        { label: "-20%", value: Math.round(item.price * 0.8) },
        { label: "-10%", value: Math.round(item.price * 0.9) },
        { label: "-5%", value: Math.round(item.price * 0.95) },
        { label: "Full", value: item.price },
      ]
    : [];

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      enableDynamicSizing={false}
    >
      <BottomSheetView style={styles.wrap}>
        <Text style={styles.title}>Make an offer</Text>
        {item && (
          <>
            <Text numberOfLines={1} style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemPrice}>Asking: {formatNaira(item.price)}</Text>

            <View style={styles.amountBox}>
              <Text style={styles.currency}>₦</Text>
              <TextInput
                keyboardType="numeric"
                value={amount !== undefined ? String(amount) : ""}
                onChangeText={(t) => setAmount(t ? parseInt(t.replace(/\D/g, "")) || undefined : undefined)}
                style={styles.amountInput}
                placeholder="Your offer"
                placeholderTextColor={colors.textMuted}
                testID="offer-amount-input"
              />
            </View>

            <View style={styles.bumpRow}>
              {quickBumps.map((b) => (
                <Pressable
                  key={b.label}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setAmount(b.value);
                  }}
                  style={[styles.bumpChip, amount === b.value && styles.bumpChipActive]}
                >
                  <Text style={[styles.bumpChipText, amount === b.value && { color: "#fff" }]}>
                    {b.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              placeholder="Add a message (optional)"
              placeholderTextColor={colors.textMuted}
              value={msg}
              onChangeText={setMsg}
              multiline
              style={styles.messageInput}
              testID="offer-message"
            />

            <Pressable
              onPress={submit}
              style={[styles.cta, (sending || sent) && { opacity: 0.6 }]}
              disabled={sending || sent}
              testID="submit-offer"
            >
              {sent ? (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.ctaText}>Offer sent</Text>
                </>
              ) : (
                <Text style={styles.ctaText}>
                  {sending ? "Sending…" : `Send offer${amount ? ` · ${formatNaira(amount)}` : ""}`}
                </Text>
              )}
            </Pressable>
          </>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

MakeOfferSheet.displayName = "MakeOfferSheet";

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { backgroundColor: colors.borderStrong, width: 44, height: 5 },
  wrap: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: 8 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3, marginBottom: 4 },
  itemName: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  itemPrice: { fontSize: 12, color: colors.textTertiary, fontWeight: "600", marginTop: 2, marginBottom: 20 },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 68,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  currency: { fontSize: 26, fontWeight: "800", color: colors.textSecondary },
  amountInput: { flex: 1, fontSize: 28, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  bumpRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  bumpChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  bumpChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  bumpChipText: { fontSize: 12, fontWeight: "800", color: colors.text },
  messageInput: {
    marginTop: 16,
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  cta: {
    marginTop: 18,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
});
