import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";
import { TokenIcon } from "@/src/components/TokenIcon";

export default function UnlocksScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .walletUnlocks()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Unlocked Properties</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-open-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No unlocked properties yet</Text>
          <Text style={styles.emptyBody}>
            When you unlock a property, it stays here forever.
          </Text>
          <Pressable style={styles.emptyCta} onPress={() => router.replace("/")}>
            <Text style={styles.emptyCtaText}>Explore properties</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {items.map((it) => {
            const p = it.property;
            if (!p) return null;
            return (
              <Pressable
                key={it.id}
                onPress={() => router.push(`/property/${p.id}`)}
                style={[styles.card, shadows.card]}
              >
                <Image
                  source={{ uri: p.images?.[0] }}
                  style={styles.image}
                  contentFit="cover"
                />
                <View style={styles.body}>
                  <Text style={styles.title} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="location" size={11} color={colors.red} />
                    <Text style={styles.location} numberOfLines={1}>
                      {p.location}
                    </Text>
                  </View>
                  <Text style={styles.price}>{formatNaira(p.price)}</Text>
                  <View style={styles.metaRow}>
                    <TokenIcon size={12} />
                    <Text style={styles.meta}>
                      Unlocked for {it.tokens_paid > 0 ? `${it.tokens_paid} tokens` : "FREE"}
                    </Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.meta}>
                      {new Date(it.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: 10 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.text, textAlign: "center" },
  emptyBody: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },
  emptyCta: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  emptyCtaText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  card: {
    flexDirection: "row",
    borderRadius: radius.md,
    backgroundColor: "#fff",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  image: { width: 100, height: 100 },
  body: { flex: 1, padding: spacing.md, justifyContent: "center", gap: 3 },
  title: { fontSize: 14, fontWeight: "800", color: colors.text },
  location: { fontSize: 12, color: colors.textSecondary },
  price: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  meta: { fontSize: 10, color: colors.textTertiary, fontWeight: "700" },
  metaDot: { fontSize: 10, color: colors.textTertiary },
});
