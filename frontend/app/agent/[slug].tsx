import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Share, Linking, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, Chip, EmptyState, IconButton, Screen, ScreenHeader, Section, Skeleton, SkeletonRows, useToast } from "@/src/ui";

type PublicAgent = Awaited<ReturnType<typeof api.publicAgentBySlug>>;
type Property = Awaited<ReturnType<typeof api.publicAgentListings>>[number];

const WHATSAPP_GREEN = "#25D366";

export default function AgentPublicProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [agent, setAgent] = useState<PublicAgent | null>(null);
  const [listings, setListings] = useState<Property[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      setError(null);
      const [a, l, r] = await Promise.all([api.publicAgentBySlug(slug as string), api.publicAgentListings(slug as string).catch(() => []), api.listAgentReviews(slug as string, 10).catch(() => [])]);
      setAgent(a);
      setListings(l);
      setReviews(r);
    } catch (e: any) {
      setError(e?.message ?? "Could not load agent profile");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

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
        message: `${agent.full_name}${agent.agency_name ? ` · ${agent.agency_name}` : ""} — ${agent.badge.label} on AMASS. See listings: ${agent.share_url}`,
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
    const text = encodeURIComponent(`Hi ${agent.full_name}, I saw your AMASS profile: ${agent.share_url}`);
    Linking.openURL(`https://wa.me/?text=${text}`).catch(() => toast.error("WhatsApp not available", "Install WhatsApp or use in-app chat instead."));
    api.recordAgentShare(agent.slug, "whatsapp", "profile-cta").catch(() => {});
  };

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Agent profile" />
        <View style={{ alignItems: "center", padding: space[4], gap: space[4] }}>
          <Skeleton width={96} height={96} radius={48} />
          <Skeleton width={180} height={24} />
          <Skeleton width={120} height={14} />
          <SkeletonRows rows={3} style={{ alignSelf: "stretch", marginTop: space[4] }} />
        </View>
      </Screen>
    );
  }

  if (error || !agent) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Agent profile" />
        <EmptyState variant="error" title="Agent unavailable" body={error || "Try again later"} actionLabel="Retry" onAction={load} />
      </Screen>
    );
  }

  const verified = agent.badge?.id ? agent.badge.id !== "registered" : false;

  return (
    <Screen testID="agent-public-profile">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Agent profile" right={<IconButton icon="share-outline" label="Share profile" onPress={onShare} testID="agent-share-header" />} />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60, gap: space[5] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Avatar name={agent.full_name} uri={agent.avatar_url} size={96} verified={verified} />
          <View style={{ alignItems: "center", gap: 2 }}>
            <AppText variant="h1" align="center">
              {agent.full_name}
            </AppText>
            {!!agent.agency_name && (
              <AppText variant="body" tone="secondary" align="center">
                {agent.agency_name}
              </AppText>
            )}
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.tierBadge, { backgroundColor: agent.badge.colour }]}>
              <Ionicons name={agent.badge.icon as any} size={12} color="#fff" />
              <AppText variant="micro" color="#fff">
                {agent.badge.label}
              </AppText>
            </View>
            {agent.identity_verified && <Badge label="Identity verified" tone="success" icon="shield-checkmark" testID="agent-identity-badge" />}
            {agent.is_founding_agent && <Badge label="Founding agent" tone="mass" icon="star" />}
          </View>

          <View style={styles.metaRow}>
            {(agent.state || agent.lga) && <Badge label={[agent.lga, agent.state].filter(Boolean).join(", ")} icon="location" />}
            {agent.years_experience > 0 && <Badge label={`${agent.years_experience} yrs experience`} icon="briefcase" />}
          </View>
        </View>

        {/* Stats */}
        <Card elevation="xs" style={{ marginHorizontal: space[4] }} padded={false}>
          <View style={styles.statsRow}>
            <StatCell label="Active" value={agent.active_listings.toString()} />
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <StatCell label="Verified" value={agent.verified_listings.toString()} />
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <StatCell label="Rating" value={agent.reviews_count > 0 ? `${agent.rating.toFixed(1)}★` : "—"} caption={agent.reviews_count > 0 ? `${agent.reviews_count} reviews` : "No reviews yet"} />
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <StatCell label="Response" value={agent.response_rate > 0 ? `${Math.round(agent.response_rate * 100)}%` : "—"} />
          </View>
        </Card>

        {/* CTAs */}
        <View style={styles.ctaRow}>
          <Button label="Message on WhatsApp" iconLeft="logo-whatsapp" style={{ flex: 1, backgroundColor: WHATSAPP_GREEN }} onPress={openWhatsApp} testID="agent-whatsapp" />
          <Button label="Share" variant="secondary" iconLeft="share-outline" onPress={onShare} testID="agent-share" />
        </View>

        {/* Coverage */}
        {agent.areas_of_operation.length > 0 && (
          <Section title="Areas covered">
            <View style={styles.chipWrap}>
              {agent.areas_of_operation.map((a) => (
                <Chip key={a} label={a} icon="location-outline" />
              ))}
            </View>
          </Section>
        )}

        {/* Specialisations */}
        {agent.specialisations.length > 0 && (
          <Section title="Specialisation">
            <View style={styles.chipWrap}>
              {agent.specialisations.map((a) => (
                <Chip key={a} label={a} />
              ))}
            </View>
          </Section>
        )}

        {/* Listings */}
        <Section title={`Active listings (${listings.length})`} actionLabel={listings.length > 3 ? "View all" : undefined} onAction={listings.length > 3 ? () => router.push(`/agent/${agent.slug}/listings` as any) : undefined}>
          {listings.length === 0 ? (
            <EmptyState compact icon="business-outline" title="No active listings yet" />
          ) : (
            listings.slice(0, 5).map((p) => (
              <Card key={p.id} onPress={() => router.push(`/property/${p.id}`)} elevation="xs" padded={false} testID={`agent-listing-${p.id}`}>
                <View style={styles.listingRow}>
                  <Image source={{ uri: p.images?.[0] }} style={[styles.listingImg, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText variant="title" numberOfLines={1}>
                      {p.title}
                    </AppText>
                    <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                      {[p.city, p.state].filter(Boolean).join(", ")}
                    </AppText>
                    <AppText variant="bodyMedium" weight="bold" tabular>
                      {formatNaira(p.price)}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Card>
            ))
          )}
        </Section>

        <ReviewsSection reviews={reviews} />

        <AppText variant="caption" tone="tertiary" align="center">
          AMASS Verified · amass.africa/agent/{agent.slug}
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function ReviewsSection({ reviews }: { reviews: any[] }) {
  const { colors } = useTheme();
  if (reviews.length === 0) return null;
  return (
    <Section title={`Customer reviews (${reviews.length})`}>
      {reviews.slice(0, 5).map((r) => (
        <Card key={r.id} elevation="xs" style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Avatar name={r.reviewer_name || "?"} uri={r.reviewer_avatar} size={34} tone="soft" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyMedium">{r.reviewer_name || "AMASS customer"}</AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ flexDirection: "row", gap: 1 }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Ionicons key={i} name={i <= r.rating ? "star" : "star-outline"} size={12} color={i <= r.rating ? colors.mass : colors.textMuted} />
                  ))}
                </View>
                <AppText variant="micro" tone="tertiary">
                  {new Date(r.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                </AppText>
              </View>
            </View>
          </View>
          {r.review_text && (
            <AppText variant="bodySm" tone="secondary">
              {r.review_text}
            </AppText>
          )}
        </Card>
      ))}
    </Section>
  );
}

function StatCell({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <View style={styles.statCell} accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="h3" tabular>
        {value}
      </AppText>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
      {caption ? (
        <AppText variant="micro" tone="muted" numberOfLines={1}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingTop: space[2] },
  badgeRow: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  tierBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 24, borderRadius: radii.pill },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  statsRow: { flexDirection: "row", alignItems: "stretch", paddingVertical: space[3] },
  statCell: { flex: 1, alignItems: "center", gap: 2, paddingHorizontal: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  ctaRow: { flexDirection: "row", gap: 10, paddingHorizontal: space[4] },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  listingRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  listingImg: { width: 92, height: 72, borderRadius: radii.sm },
});
