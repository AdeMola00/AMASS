import React from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInDown, Layout } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useCart } from "@/src/contexts/cart";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, Divider, EmptyState, IconButton, Screen, ScreenHeader, SkeletonRows, useToast } from "@/src/ui";

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { cart, loading, update, remove, clear, count } = useCart();

  const isEmpty = cart.items.length === 0;
  const delivery = isEmpty ? 0 : 5000;
  const total = cart.subtotal + delivery;

  return (
    <Screen testID="cart-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Cart"
        subtitle={!isEmpty ? `${count} item${count === 1 ? "" : "s"}` : undefined}
        backTestID="cart-back"
        right={
          !isEmpty ? (
            <IconButton
              icon="trash-outline"
              label="Clear cart"
              variant="ghost"
              color={colors.textSecondary}
              onPress={() => {
                clear();
                toast.info("Cart cleared");
              }}
              testID="cart-clear"
            />
          ) : undefined
        }
      />

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={3} />
        </View>
      ) : isEmpty ? (
        <EmptyState
          icon="bag-outline"
          title="Your cart is empty"
          body="Discover premium products from verified vendors."
          actionLabel="Browse Market"
          onAction={() => router.replace("/(tabs)/marketplace")}
          testID="browse-market"
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: space[4], gap: 12, paddingBottom: 200 + insets.bottom }} showsVerticalScrollIndicator={false}>
            {cart.items.map((line, i) => (
              <Animated.View key={line.item.id} entering={FadeInDown.delay(i * 40).duration(220)} layout={Layout.springify()}>
                <Card elevation="xs" padded={false} testID={`cart-line-${line.item.id}`} style={{ padding: 12 }}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Image source={{ uri: line.item.image }} style={[styles.img, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <AppText variant="micro" tone="tertiary" uppercase numberOfLines={1}>
                        {line.item.vendor}
                      </AppText>
                      <AppText variant="bodyMedium" numberOfLines={2}>
                        {line.item.name}
                      </AppText>
                      <AppText variant="title" tabular>
                        {formatNaira(line.item.price)}
                      </AppText>
                      <View style={styles.qtyRow}>
                        <View style={[styles.stepper, { backgroundColor: colors.surfaceAlt }]}>
                          <Pressable
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              update(line.item.id, line.quantity - 1);
                            }}
                            style={styles.stepBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Decrease quantity"
                            testID={`qty-dec-${line.item.id}`}
                          >
                            <Ionicons name="remove" size={16} color={colors.text} />
                          </Pressable>
                          <AppText variant="bodyMedium" tabular style={{ minWidth: 22, textAlign: "center" }}>
                            {line.quantity}
                          </AppText>
                          <Pressable
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              update(line.item.id, line.quantity + 1);
                            }}
                            style={styles.stepBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Increase quantity"
                            testID={`qty-inc-${line.item.id}`}
                          >
                            <Ionicons name="add" size={16} color={colors.text} />
                          </Pressable>
                        </View>
                        <View style={{ flex: 1 }} />
                        <Pressable
                          onPress={() => {
                            remove(line.item.id);
                            toast.info("Removed from cart");
                          }}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${line.item.name}`}
                          testID={`remove-${line.item.id}`}
                          style={styles.removeBtn}
                        >
                          <Ionicons name="close" size={18} color={colors.textTertiary} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Card>
              </Animated.View>
            ))}

            <Card elevation="xs" style={{ gap: 10, marginTop: 4 }}>
              <Row label="Subtotal" value={formatNaira(cart.subtotal)} />
              <Row label="Delivery estimate" value={formatNaira(delivery)} />
              <Divider />
              <Row label="Total" value={formatNaira(total)} strong />
            </Card>

            <Pressable
              onPress={() => toast.info("Promo codes", "Coming soon — we'll let you know when codes go live.")}
              accessibilityRole="button"
              style={({ pressed }) => [styles.promo, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="pricetag-outline" size={18} color={colors.text} />
              <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                Have a promo code?
              </AppText>
              <AppText variant="caption" weight="bold" tone="brand">
                Apply
              </AppText>
            </Pressable>
          </ScrollView>

          <View style={[styles.sticky, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }, shadows.lg]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label" tone="tertiary" uppercase>
                Total
              </AppText>
              <AppText variant="h2" tabular>
                {formatNaira(total)}
              </AppText>
            </View>
            <Button label="Checkout" size="lg" iconRight="arrow-forward" onPress={() => router.push("/checkout")} testID="go-checkout" />
          </View>
        </>
      )}
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant={strong ? "title" : "bodySm"} tone={strong ? "primary" : "tertiary"}>
        {label}
      </AppText>
      <AppText variant={strong ? "h3" : "bodyMedium"} tabular>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { width: 96, height: 96, borderRadius: radii.sm },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  stepper: { flexDirection: "row", alignItems: "center", borderRadius: radii.pill, height: 36, paddingHorizontal: 4 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  removeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  promo: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
