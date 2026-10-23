/**
 * AMASS Property Passport — public SEO-friendly canonical page
 * URL: /property-passport/AMASS-XXX-YYYYYYYY
 *
 * Public by design — anonymous access. Data is filtered server-side via the
 * per-property `passport_visibility` document (admin-controlled). This UI just
 * renders whatever the passport payload includes; it never re-requests
 * sensitive fields.
 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Share, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { palette, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, SegmentedControl, Skeleton, VerifiedBadge, useToast, type BadgeTone, type IconName } from "@/src/ui";
import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { PropertyScoreCard } from "@/src/components/PropertyScoreCard";
import { PropertyTypeChip } from "@/src/components/PropertyTypeChip";

type PassportData = Awaited<ReturnType<typeof api.getPassport>>;
type Tab = "about" | "listings" | "history";

export default function PropertyPassportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ amass_id?: string }>();
  const amass_id = String(params.amass_id ?? "");

  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("about");
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.getPassport(amass_id);
      setData(r);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load property");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [amass_id]);

  useEffect(() => {
    if (!amass_id) return;
    load();
  }, [amass_id, load]);

  const shareLink = useCallback(async () => {
    if (!data) return;
    try {
      Haptics.selectionAsync().catch(() => {});
      await Share.share({
        title: `${data.property.property_type ?? "Property"} on AMASS`,
        message: `Check this property on AMASS (${data.property.amass_property_id})\n\n${data.share.passport_url}`,
        url: data.share.passport_url,
      });
    } catch {}
  }, [data]);

  const copyLink = useCallback(async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.share.passport_url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.success("Link copied", "Passport link is on your clipboard.");
  }, [data, toast]);

  if (loading) {
    return (
      <Screen testID="passport-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Property Passport" subtitle={amass_id} backTestID="passport-back" />
        <View style={{ gap: 16 }}>
          <Skeleton height={280} radius={0} />
          <View style={{ paddingHorizontal: space[4], gap: 10 }}>
            <Skeleton height={28} width="60%" />
            <Skeleton height={16} width="45%" />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Skeleton height={30} width={90} radius={radii.pill} />
              <Skeleton height={30} width={70} radius={radii.pill} />
              <Skeleton height={30} width={80} radius={radii.pill} />
            </View>
            <Skeleton height={150} radius={radii.lg} style={{ marginTop: 8 }} />
          </View>
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen testID="passport-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Property Passport" backTestID="passport-back" />
        <EmptyState
          variant="error"
          title={error ?? "Property not found"}
          body={`The AMASS ID ${amass_id} could not be resolved. It may have been merged into another passport.`}
          actionLabel="Try again"
          onAction={() => { setLoading(true); load(); }}
          secondaryLabel="Go back"
          onSecondary={() => router.back()}
        />
      </Screen>
    );
  }

  const p = data.property;
  const primaryPhoto = p.photos?.[0];
  const primaryListing = data.listings[0];
  const priceStr = primaryListing?.price ? formatNaira(primaryListing.price) : null;
  const areaStr = [p.estate, p.area, p.lga, p.state].filter(Boolean).join(", ");
  const photoW = (W - 2 * space[4] - 8) / 2;
  const canEnquire = !!data.share.allow_enquiries;

  return (
    <Screen testID="passport-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={p.amass_property_id}
        subtitle="Property Passport"
        backTestID="passport-back"
        right={<IconButton icon="share-outline" label="Share passport" onPress={shareLink} testID="passport-share" />}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: canEnquire ? 120 + insets.bottom : 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.text} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}>
          {primaryPhoto ? (
            <Image source={{ uri: primaryPhoto }} style={styles.heroImg} contentFit="cover" transition={300} />
          ) : (
            <View style={[styles.heroImg, { alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="home-outline" size={48} color={colors.textMuted} />
              <AppText variant="caption" tone="muted" style={{ marginTop: 8 }}>No photos yet</AppText>
            </View>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.55)"]} style={styles.heroScrim} pointerEvents="none" />
          <View style={styles.heroOverlay}>
            <View style={{ gap: 6 }}>
              {p.has_verified_representation ? <VerifiedBadge size="md" /> : null}
            </View>
            {priceStr && (
              <View style={[styles.priceChip, { backgroundColor: colors.bgElevated }, shadows.md]}>
                <AppText variant="h3" tabular>{priceStr}</AppText>
                {primaryListing?.listing_type && (
                  <AppText variant="micro" tone="tertiary" uppercase>{primaryListing.listing_type}</AppText>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Title block */}
        <View style={styles.section}>
          <AppText variant="h1">
            {p.property_type ?? "Property"}{p.details?.bedrooms ? ` · ${p.details.bedrooms} bed` : ""}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <AppText variant="body" tone="secondary" style={{ flex: 1 }}>{areaStr || "—"}</AppText>
          </View>

          <View style={styles.factsRow}>
            <PropertyTypeChip type={p.property_type} variant="soft" size="sm" showIcon testID="passport-type-chip" />
            {p.details?.bedrooms != null && <Fact icon="bed-outline" label={`${p.details.bedrooms} bd`} />}
            {p.details?.bathrooms != null && <Fact icon="water-outline" label={`${p.details.bathrooms} ba`} />}
            {p.size?.building_size_sqm != null && <Fact icon="expand-outline" label={`${p.size.building_size_sqm} m²`} />}
            {p.size?.land_size_sqm != null && <Fact icon="leaf-outline" label={`${p.size.land_size_sqm} m² land`} />}
            {p.details?.year_built != null && <Fact icon="calendar-outline" label={`Built ${p.details.year_built}`} />}
          </View>
        </View>

        {/* D-6/D-7/D-8: Verification score + AI value strip · shareable */}
        <PropertyScoreCard
          amassId={p.amass_property_id}
          propertyType={p.property_type}
          addressLine={areaStr || (p as any).raw_address}
          cover={p.photos?.[0] ?? (p as any).media_ids?.[0]}
        />

        {/* Segmented tabs */}
        <View style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>
          <SegmentedControl<Tab>
            options={[
              { value: "about", label: "About", icon: "information-circle-outline" },
              { value: "listings", label: `Listings (${data.listings.length})`, icon: "pricetag-outline" },
              { value: "history", label: "History", icon: "time-outline" },
            ]}
            value={tab}
            onChange={setTab}
            testIDPrefix="passport-tab"
          />
        </View>

        {tab === "about" && (
          <>
            {/* Map (rounded, uses low-precision coords by default) */}
            {p.coordinates?.latitude && p.coordinates?.longitude && (
              <View style={styles.section}>
                <SectionTitle title="Location" caption={p.coordinates_precision === "exact" ? "Exact location" : "Approximate location shown for privacy"} />
                <View style={[styles.mapWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <MapView
                    style={StyleSheet.absoluteFill}
                    provider={PROVIDER_DEFAULT}
                    initialRegion={{
                      latitude: p.coordinates.latitude,
                      longitude: p.coordinates.longitude,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                  >
                    <Marker coordinate={p.coordinates}>
                      <View style={[styles.pinDot, { backgroundColor: colors.brand, borderColor: colors.bgElevated }]}>
                        <Ionicons name="home" size={14} color={colors.onBrand} />
                      </View>
                    </Marker>
                  </MapView>
                </View>
              </View>
            )}

            {/* Amenities */}
            {p.amenities && p.amenities.length > 0 && (
              <View style={styles.section}>
                <SectionTitle title="Features & amenities" />
                <View style={styles.chipsWrap}>
                  {p.amenities.map((a) => (
                    <View key={a} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <AppText variant="caption" weight="semibold">{a}</AppText>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Representatives */}
            {data.representatives.length > 0 && (
              <View style={styles.section}>
                <SectionTitle title="Verified representatives" caption="Mandated agents authorised to market this property" />
                <View style={{ gap: 10 }}>
                  {data.representatives.map((r) => (
                    <Card
                      key={r.id}
                      elevation="xs"
                      style={styles.repCard}
                      onPress={r.agent.slug ? () => router.push(`/agent/${r.agent.slug}` as any) : undefined}
                      testID={`rep-${r.id}`}
                    >
                      <Avatar name={r.agent.full_name ?? "Verified Agent"} uri={r.agent.avatar_url} size={48} verified />
                      <View style={{ flex: 1, gap: 3 }}>
                        <AppText variant="title">{r.agent.full_name ?? "Verified Agent"}</AppText>
                        {r.agent.agency_name ? <AppText variant="caption" tone="tertiary">{r.agent.agency_name}</AppText> : null}
                        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <Badge
                            label={r.representation_type === "owner" ? "Owner" : r.representation_type === "agent_mandate" ? "Mandated agent" : r.representation_type.replace(/_/g, " ")}
                            tone="inverse"
                            icon="shield-checkmark"
                            size="xs"
                          />
                          {r.mandate_type ? <Badge label={r.mandate_type} tone="neutral" size="xs" /> : null}
                        </View>
                      </View>
                      {r.agent.slug ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
                    </Card>
                  ))}
                </View>
              </View>
            )}

            {/* Photos grid */}
            {p.photos && p.photos.length > 1 && (
              <View style={styles.section}>
                <SectionTitle title="Photos" caption={`${p.photos.length} approved`} />
                <View style={styles.photoGrid}>
                  {p.photos.slice(0, 8).map((u, idx) => (
                    <View key={`${idx}-${u.slice(0, 20)}`} style={[styles.photoWrap, { width: photoW, backgroundColor: colors.surfaceAlt }]}>
                      <Image source={{ uri: u }} style={styles.photo} contentFit="cover" transition={200} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Share / QR */}
            <View style={styles.section}>
              <SectionTitle title="Share this passport" caption="The passport URL is stable — even if the agent, price or listing changes" />
              <View style={styles.shareRow}>
                <Button label="Share" iconLeft="share-outline" variant="outline" size="sm" style={{ flex: 1 }} onPress={shareLink} testID="share-native" />
                <Button label="Copy link" iconLeft="link-outline" variant="outline" size="sm" style={{ flex: 1 }} onPress={copyLink} testID="share-copy" />
                {data.share.qr_url && (
                  <Button label="QR" iconLeft="qr-code-outline" variant={showQr ? "primary" : "outline"} size="sm" style={{ flex: 1 }} onPress={() => setShowQr((v) => !v)} testID="share-qr" />
                )}
              </View>
              {showQr && (
                <Card elevation="xs" style={styles.qrCard}>
                  <View style={styles.qrFrame}>
                    <QRCode value={data.share.passport_url} size={180} color={palette.neutral[1000]} backgroundColor={palette.neutral[0]} />
                  </View>
                  <AppText variant="caption" tone="tertiary" align="center" selectable>{data.share.passport_url}</AppText>
                </Card>
              )}
            </View>
          </>
        )}

        {tab === "listings" && (
          <View style={styles.section}>
            <SectionTitle title="Current listings" caption="All active listings for this physical property" />
            {data.listings.length === 0 ? (
              <EmptyState compact icon="pricetag-outline" title="No active listings" body="This property isn't on the market right now." />
            ) : (
              <View style={{ gap: 10 }}>
                {data.listings.map((l) => (
                  <Card key={l.id} elevation="xs" style={{ gap: 8 }}>
                    <View style={styles.listingTop}>
                      <Badge label={(l.listing_type ?? "buy").toUpperCase()} tone="inverse" />
                      <StatusPill status={l.listing_status} />
                    </View>
                    {l.price != null && <AppText variant="h2" tabular>{formatNaira(l.price)}</AppText>}
                    {l.description ? <AppText variant="bodySm" tone="secondary" numberOfLines={3}>{l.description}</AppText> : null}
                    <AppText variant="caption" tone="tertiary">Listed {formatDate(l.created_at)}</AppText>
                  </Card>
                ))}
              </View>
            )}
          </View>
        )}

        {tab === "history" && (
          <View style={styles.section}>
            <SectionTitle title="Property timeline" caption="Public history for this AMASS ID" />
            {data.timeline.length === 0 ? (
              <EmptyState compact icon="time-outline" title="No public events yet" body="Verification, listing and merge events will appear here." />
            ) : (
              <View style={{ gap: 2 }}>
                {data.timeline.map((e, i) => (
                  <View key={i} style={styles.timelineRow}>
                    <View style={{ alignItems: "center", width: 14 }}>
                      <View style={[styles.timelineDot, { backgroundColor: i === 0 ? colors.brand : colors.borderStrong }]} />
                      {i < data.timeline.length - 1 && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14 }}>
                      <AppText variant="bodyMedium">{e.label}</AppText>
                      <AppText variant="caption" tone="tertiary" style={{ marginTop: 2 }}>{formatDate(e.at)}</AppText>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Sticky enquiry CTA */}
      {canEnquire && (
        <View
          style={[
            styles.stickyBar,
            { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: isDark ? "rgba(13,12,11,0.96)" : "rgba(250,250,249,0.96)", borderTopColor: colors.border },
          ]}
        >
          <Button
            label="Enquire about this property"
            iconLeft="chatbubbles"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => {
              if (data.representatives[0]?.agent?.slug) {
                router.push(`/agent/${data.representatives[0].agent.slug}` as any);
              } else {
                toast.info("No representative yet", "This property doesn't have a verified agent yet.");
              }
            }}
            testID="enquire-btn"
          />
        </View>
      )}
    </Screen>
  );
}

function Fact({ icon, label }: { icon: IconName; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fact, { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <AppText variant="caption" weight="bold">{label}</AppText>
    </View>
  );
}

function SectionTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <View style={{ marginBottom: 12, gap: 2 }}>
      <AppText variant="h3">{title}</AppText>
      {caption ? <AppText variant="caption" tone="tertiary">{caption}</AppText> : null}
    </View>
  );
}

function StatusPill({ status }: { status?: string }) {
  const s = (status ?? "").toUpperCase();
  const tone: BadgeTone = s === "ACTIVE" || s === "APPROVED" ? "success" : s === "PENDING_REVIEW" ? "warning" : "neutral";
  return <Badge label={s.replace(/_/g, " ") || "—"} tone={tone} />;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(iso).slice(0, 10);
  }
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 280, position: "relative" },
  heroImg: { width: "100%", height: "100%" },
  heroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 140 },
  heroOverlay: { position: "absolute", left: 16, right: 16, bottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8 },
  priceChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.md, alignItems: "flex-end" },

  section: { paddingHorizontal: space[4], paddingVertical: space[5] },
  factsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14, alignItems: "center" },
  fact: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 30, borderRadius: radii.pill },

  mapWrap: { height: 200, borderRadius: radii.lg, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  pinDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 3 },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 32, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },

  repCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },

  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoWrap: { aspectRatio: 1.3, borderRadius: radii.sm, overflow: "hidden" },
  photo: { width: "100%", height: "100%" },

  shareRow: { flexDirection: "row", gap: 8 },
  qrCard: { marginTop: 14, alignItems: "center", gap: 12 },
  qrFrame: { padding: 12, borderRadius: radii.md, backgroundColor: palette.neutral[0] },

  listingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  timelineRow: { flexDirection: "row", gap: 12 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  timelineLine: { flex: 1, width: 2, marginTop: 4, borderRadius: 1 },

  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space[4], borderTopWidth: StyleSheet.hairlineWidth },
});
