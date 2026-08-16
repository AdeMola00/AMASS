import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Share,
  Linking,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

type PublicAgent = Awaited<ReturnType<typeof api.publicAgentBySlug>>;
type Property = Awaited<ReturnType<typeof api.publicAgentListings>>[number];

export default function AgentPublicProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [agent, setAgent] = useState<PublicAgent | null>(null);
  const [listings, setListings] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!slug) return;
    try {
      setError(null);
      const [a, l] = await Promise.all([
        api.publicAgentBySlug(slug as string),
        api.publicAgentListings(slug as string).catch(() => []),
      ]);
      setAgent(a);
      setListings(l);
    } catch (e: any) {
      setError(e?.message ?? "Could not load agent profile");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onShare = async () => {
    if (!agent) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await Share.share({
        title: `${agent.full_name} on AMASS`,
        message: `${agent.full_name}${
          agent.agency_name ? ` · ${agent.agency_name}` : ""
        } — ${agent.badge.label} on AMASS. See listings: ${agent.share_url}`,
        url: agent.share_url,
      });
      api.recordAgentShare(agent.slug, "native_share", "profile-header").catch(() => {});
    } catch {}
  };

  const openWhatsApp = () => {
    if (!agent) return;
    // Public profile doesn't expose phone number directly; deep-link to
    // WhatsApp with the profile URL so the customer can start a chat via
    // AMASS. When contact info is unlocked we can pre-fill the number.
    const text = encodeURIComponent(
      `Hi ${agent.full_name}, I saw your AMASS profile: ${agent.share_url}`
    );
    Linking.openURL(`https://wa.me/?text=${text}`).catch(() =>
      Alert.alert("WhatsApp not available")
    );
    api.recordAgentShare(agent.slug, "whatsapp", "profile-cta").catch(() => {});
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.red} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !agent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle" size={48} color={colors.textMuted} />
          <Text style={styles.errorTitle}>Agent unavailable</Text>
          <Text style={styles.errorSub}>{error || "Try again later"}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials = agent.full_name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Agent profile</Text>
          <Pressable onPress={onShare} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="share-outline" size={22} color={colors.ink} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            {agent.avatar_url ? (
              <Image
                source={{ uri: agent.avatar_url }}
                style={{ width: 96, height: 96, borderRadius: 48 }}
              />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </View>
          <Text style={styles.name}>{agent.full_name}</Text>
          {!!agent.agency_name && (
            <Text style={styles.agency}>{agent.agency_name}</Text>
          )}

          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: agent.badge.colour }]}>
              <Ionicons name={agent.badge.icon as any} size={12} color={colors.bg} />
              <Text style={styles.badgeText}>{agent.badge.label}</Text>
            </View>
            {agent.is_founding_agent && (
              <View style={styles.foundingBadge}>
                <Ionicons name="star" size={12} color={colors.bg} />
                <Text style={styles.badgeText}>FOUNDING AGENT</Text>
              </View>
            )}
          </View>

          <View style={styles.metaRow}>
            {(agent.state || agent.lga) && (
              <View style={styles.metaChip}>
                <Ionicons name="location" size={12} color={colors.textSecondary} />
                <Text style={styles.metaText}>
                  {[agent.lga, agent.state].filter(Boolean).join(", ")}
                </Text>
              </View>
            )}
            {agent.years_experience > 0 && (
              <View style={styles.metaChip}>
                <Ionicons name="briefcase" size={12} color={colors.textSecondary} />
                <Text style={styles.metaText}>
                  {agent.years_experience} yrs experience
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCell label="Active" value={agent.active_listings.toString()} />
          <View style={styles.statDivider} />
          <StatCell label="Verified" value={agent.verified_listings.toString()} />
          <View style={styles.statDivider} />
          <StatCell
            label="Rating"
            value={
              agent.reviews_count > 0
                ? `${agent.rating.toFixed(1)}★`
                : "—"
            }
            caption={
              agent.reviews_count > 0 ? `${agent.reviews_count} reviews` : "No reviews yet"
            }
          />
          <View style={styles.statDivider} />
          <StatCell
            label="Response"
            value={
              agent.response_rate > 0
                ? `${Math.round(agent.response_rate * 100)}%`
                : "—"
            }
          />
        </View>

        {/* CTAs */}
        <View style={styles.ctaRow}>
          <Pressable
            style={[styles.ctaBtn, styles.ctaPrimary]}
            onPress={openWhatsApp}
            testID="agent-whatsapp"
          >
            <Ionicons name="logo-whatsapp" size={18} color={colors.bg} />
            <Text style={styles.ctaPrimaryText}>Message on WhatsApp</Text>
          </Pressable>
          <Pressable
            style={[styles.ctaBtn, styles.ctaSecondary]}
            onPress={onShare}
            testID="agent-share"
          >
            <Ionicons name="share-outline" size={18} color={colors.ink} />
            <Text style={styles.ctaSecondaryText}>Share</Text>
          </Pressable>
        </View>

        {/* Coverage */}
        {agent.areas_of_operation.length > 0 && (
          <Section title="Areas covered">
            <View style={styles.chipWrap}>
              {agent.areas_of_operation.map((a) => (
                <View key={a} style={styles.chip}>
                  <Text style={styles.chipText}>{a}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Specialisations */}
        {agent.specialisations.length > 0 && (
          <Section title="Specialisation">
            <View style={styles.chipWrap}>
              {agent.specialisations.map((a) => (
                <View key={a} style={styles.chip}>
                  <Text style={styles.chipText}>{a}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Listings */}
        <Section
          title={`Active listings (${listings.length})`}
          action={
            listings.length > 3
              ? { label: "View all", onPress: () => router.push(`/agent/${agent.slug}/listings` as any) }
              : undefined
          }
        >
          {listings.length === 0 ? (
            <View style={styles.emptyListings}>
              <Ionicons name="business-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No active listings yet</Text>
            </View>
          ) : (
            listings.slice(0, 5).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/property/${p.id}`)}
                style={styles.listingRow}
              >
                <Image
                  source={{ uri: p.images?.[0] }}
                  style={{ width: 96, height: 76, borderRadius: 10, backgroundColor: colors.surfaceSecondary }}
                  contentFit="cover"
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={1} style={styles.listingTitle}>
                    {p.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.listingLocation}>
                    {[p.city, p.state].filter(Boolean).join(", ")}
                  </Text>
                  <Text style={styles.listingPrice}>{formatNaira(p.price)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ))
          )}
        </Section>

        <Text style={styles.legal}>
          AMASS Verified · amass.africa/agent/{agent.slug}
        </Text>
      </ScrollView>
    </View>
  );
}

function StatCell({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {caption && <Text style={styles.statCaption}>{caption}</Text>}
    </View>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action && (
          <Pressable onPress={action.onPress}>
            <Text style={styles.sectionAction}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h3, color: colors.ink },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errorTitle: { ...typography.h3, color: colors.ink, marginTop: spacing.md },
  errorSub: { ...typography.body, color: colors.textSecondary, marginTop: 4 },

  hero: { alignItems: "center", padding: spacing.xl, gap: 6 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarInitials: {
    color: colors.textInverse,
    fontSize: 32,
    fontWeight: "700",
  },
  name: { ...typography.h2, color: colors.ink },
  agency: { ...typography.body, color: colors.textSecondary },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  foundingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  badgeText: {
    color: colors.bg,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  metaText: { color: colors.textSecondary, fontSize: 12 },

  statsRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    ...shadows.soft,
  },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.ink },
  statLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  statCaption: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },

  ctaRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  ctaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.md,
  },
  ctaPrimary: { backgroundColor: colors.ink },
  ctaSecondary: { borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.bg },
  ctaPrimaryText: { color: colors.bg, fontWeight: "700" },
  ctaSecondaryText: { color: colors.ink, fontWeight: "700" },

  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.h3, color: colors.ink },
  sectionAction: { color: colors.ink, fontSize: 13, fontWeight: "700" },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },

  emptyListings: { alignItems: "center", padding: spacing.xl, gap: 6 },
  emptyText: { color: colors.textMuted, fontSize: 13 },

  listingRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    marginBottom: spacing.sm,
    padding: 6,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  listingTitle: { ...typography.bodyBold, color: colors.ink },
  listingLocation: { color: colors.textSecondary, fontSize: 12 },
  listingPrice: { color: colors.red, fontWeight: "800", fontSize: 14 },

  legal: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
