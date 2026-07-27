import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCart } from "@/src/contexts/cart";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cart, loading, update, remove, clear, count } = useCart();

  const isEmpty = cart.items.length === 0;
  const delivery = isEmpty ? 0 : 5000;
  const total = cart.subtotal + delivery;

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="cart-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="cart-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Cart</Text>
          {!isEmpty && <Text style={styles.count}>{count} items</Text>}
        </View>
        {!isEmpty ? (
          <Pressable onPress={clear} style={styles.iconBtn} testID="cart-clear">
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.red} />
      ) : isEmpty ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="bag-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Discover premium products from verified vendors.</Text>
          <Pressable
            style={styles.browseBtn}
            onPress={() => router.replace("/(tabs)/marketplace")}
            testID="browse-market"
          >
            <Text style={styles.browseBtnText}>Browse Marketplace</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: 220 }}>
            {cart.items.map((line) => (
              <View key={line.item.id} style={[styles.line, shadows.soft]} testID={`cart-line-${line.item.id}`}>
                <Image source={{ uri: line.item.image }} style={styles.lineImg} contentFit="cover" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.lineVendor}>{line.item.vendor}</Text>
                  <Text numberOfLines={2} style={styles.lineName}>{line.item.name}</Text>
                  <Text style={styles.linePrice}>{formatNaira(line.item.price)}</Text>
                  <View style={styles.qtyRow}>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        update(line.item.id, line.quantity - 1);
                      }}
                      style={styles.qtyBtn}
                      testID={`qty-dec-${line.item.id}`}
                    >
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </Pressable>
                    <Text style={styles.qty}>{line.quantity}</Text>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        update(line.item.id, line.quantity + 1);
                      }}
                      style={styles.qtyBtn}
                      testID={`qty-inc-${line.item.id}`}
                    >
                      <Ionicons name="add" size={16} color={colors.text} />
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={() => remove(line.item.id)} hitSlop={8} testID={`remove-${line.item.id}`}>
                      <Ionicons name="close" size={18} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}

            <View style={[styles.summary, shadows.soft]}>
              <SummaryRow label="Subtotal" value={formatNaira(cart.subtotal)} />
              <SummaryRow label="Delivery estimate" value={formatNaira(delivery)} />
              <View style={styles.divider} />
              <SummaryRow label="Total" value={formatNaira(total)} bold />
            </View>

            <View style={[styles.promoWrap, shadows.soft]}>
              <Ionicons name="pricetag-outline" size={18} color={colors.text} />
              <Text style={styles.promoText}>Have a promo code?</Text>
              <Text style={styles.promoLink}>Apply</Text>
            </View>
          </ScrollView>

          <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.stickyLabel}>Total</Text>
              <Text style={styles.stickyTotal}>{formatNaira(total)}</Text>
            </View>
            <Pressable
              style={styles.checkoutBtn}
              onPress={() => router.push("/checkout")}
              testID="go-checkout"
            >
              <Text style={styles.checkoutText}>Checkout</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text style={[styles.sumLabel, bold && { color: colors.text, fontWeight: "800", fontSize: 15 }]}>{label}</Text>
      <Text style={[styles.sumValue, bold && { fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h2 },
  count: { ...typography.caption, color: colors.textTertiary },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxxl, gap: 8 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { ...typography.h2 },
  emptySub: { ...typography.body, color: colors.textTertiary, textAlign: "center" },
  browseBtn: {
    marginTop: spacing.lg,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  browseBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  line: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  lineImg: { width: 100, height: 100, borderRadius: 12, backgroundColor: colors.surfaceSecondary },
  lineVendor: { fontSize: 10, letterSpacing: 0.5, fontWeight: "700", color: colors.textTertiary, textTransform: "uppercase" },
  lineName: { fontSize: 14, fontWeight: "600", color: colors.text },
  linePrice: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 2 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  qty: { fontSize: 14, fontWeight: "800", minWidth: 24, textAlign: "center" },
  summary: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", gap: 10, marginTop: spacing.md },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sumLabel: { fontSize: 13, color: colors.textTertiary, fontWeight: "600" },
  sumValue: { fontSize: 14, fontWeight: "700", color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  promoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  promoText: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  promoLink: { fontSize: 13, fontWeight: "800", color: colors.red },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stickyLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.4 },
  stickyTotal: { fontSize: 20, fontWeight: "800", color: colors.text },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 54,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  checkoutText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
