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
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { PropertyScoreCard } from "@/src/components/PropertyScoreCard";

type PassportData = Awaited<ReturnType<typeof api.getPassport>>;

const { width: W } = Dimensions.get("window");

export default function PropertyPassportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ amass_id?: string }>();
  const amass_id = String(params.amass_id ?? "");

  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"about" | "listings" | "history">("about");
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
    Alert.alert("Copied", "Passport link copied to clipboard.");
  }, [data]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.headerBar}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Property Passport</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={40} color={colors.red} />
          <Text style={styles.errorTitle}>{error ?? "Property not found"}</Text>
          <Text style={styles.errorSub}>
            The AMASS ID <Text style={{ fontWeight: "800" }}>{amass_id}</Text> could not be resolved.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const p = data.property;
  const primaryPhoto = p.photos?.[0];
  const primaryListing = data.listings[0];
  const priceStr = primaryListing?.price ? formatNaira(primaryListing.price) : null;
  const areaStr = [p.estate, p.area, p.lga, p.state].filter(Boolean).join(", ");

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="passport-screen">
      <View style={styles.headerBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="passport-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerAmassId}>{p.amass_property_id}</Text>
          <Text style={styles.headerTitle}>Property Passport</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={shareLink} testID="passport-share">
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={colors.red} onRefresh={() => { setRefreshing(true); load(); }} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {primaryPhoto ? (
            <Image source={{ uri: primaryPhoto }} style={styles.heroImg} contentFit="cover" />
          ) : (
            <View style={[styles.heroImg, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary }]}>
              <Ionicons name="home" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: "700" }}>No photos yet</Text>
            </View>
          )}
          <View style={styles.heroOverlay}>
            {p.has_verified_representation && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            )}
            {priceStr && (
              <View style={styles.priceChip}>
                <Text style={styles.priceChipText}>{priceStr}</Text>
                {primaryListing?.listing_type && (
                  <Text style={styles.priceChipSub}>{primaryListing.listing_type.toUpperCase()}</Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Title block */}
        <View style={styles.section}>
          <Text style={styles.title}>{p.property_type ?? "Property"}{p.details?.bedrooms ? ` · ${p.details.bedrooms} bed` : ""}</Text>
          <Text style={styles.area}>{areaStr || "—"}</Text>

          <View style={styles.factsRow}>
            {p.details?.bedrooms != null && <Fact icon="bed-outline" label={`${p.details.bedrooms} bd`} />}
            {p.details?.bathrooms != null && <Fact icon="water-outline" label={`${p.details.bathrooms} ba`} />}
            {p.size?.building_size_sqm != null && <Fact icon="expand-outline" label={`${p.size.building_size_sqm} m²`} />}
            {p.size?.land_size_sqm != null && <Fact icon="leaf-outline" label={`${p.size.land_size_sqm} m² land`} />}
            {p.details?.year_built != null && <Fact icon="calendar-outline" label={`Built ${p.details.year_built}`} />}
          </View>
        </View>

        {/* D-6/D-7/D-8: Verification score + AI value strip */}
        <PropertyScoreCard amassId={p.amass_property_id} />

        {/* Segmented tabs */}
        <View style={styles.tabs}>
          {(["about", "listings", "history"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabActive]}
              testID={`passport-tab-${t}`}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === "about" ? "About" : t === "listings" ? `Listings (${data.listings.length})` : "History"}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "about" && (
          <>
            {/* Map (rounded, uses low-precision coords by default) */}
            {p.coordinates?.latitude && p.coordinates?.longitude && (
              <View style={styles.section}>
                <SectionTitle title="Location" caption={p.coordinates_precision === "exact" ? "Exact location" : "Approximate location shown for privacy"} />
                <View style={styles.mapWrap}>
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
                      <View style={styles.pinDot}>
                        <Ionicons name="home" size={14} color="#fff" />
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
                    <View key={a} style={styles.chip}>
                      <Ionicons name="checkmark" size={12} color={colors.emerald} />
                      <Text style={styles.chipText}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Representatives */}
            {data.representatives.length > 0 && (
              <View style={styles.section}>
                <SectionTitle title="Verified representatives" caption="Mandated agents authorised to market this property" />
                {data.representatives.map((r) => (
                  <Pressable
                    key={r.id}
                    style={[styles.repCard, shadows.soft]}
                    onPress={() => r.agent.slug && router.push(`/agent/${r.agent.slug}` as any)}
                    testID={`rep-${r.id}`}
                  >
                    <View style={styles.repAvatar}>
                      {r.agent.avatar_url ? (
                        <Image source={{ uri: r.agent.avatar_url }} style={styles.repAvatarImg} contentFit="cover" />
                      ) : (
                        <Ionicons name="person" size={22} color={colors.textTertiary} />
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.repName}>{r.agent.full_name ?? "Verified Agent"}</Text>
                      {r.agent.agency_name && <Text style={styles.repAgency}>{r.agent.agency_name}</Text>}
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 2 }}>
                        <View style={styles.repBadge}>
                          <Ionicons name="shield-checkmark" size={10} color="#fff" />
                          <Text style={styles.repBadgeText}>
                            {r.representation_type === "owner" ? "OWNER" : (r.representation_type === "agent_mandate" ? "MANDATED AGENT" : r.representation_type.replace(/_/g, " ").toUpperCase())}
                          </Text>
                        </View>
                        {r.mandate_type && (
                          <Text style={styles.repMeta}>· {r.mandate_type}</Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Photos grid */}
            {p.photos && p.photos.length > 1 && (
              <View style={styles.section}>
                <SectionTitle title="Photos" caption={`${p.photos.length} approved`} />
                <View style={styles.photoGrid}>
                  {p.photos.slice(0, 8).map((u, idx) => (
                    <View key={`${idx}-${u.slice(0, 20)}`} style={styles.photoWrap}>
                      <Image source={{ uri: u }} style={styles.photo} contentFit="cover" />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Share / QR */}
            <View style={styles.section}>
              <SectionTitle title="Share this passport" caption="Passport URL is stable — even if the agent, price or listing changes" />
              <View style={styles.shareRow}>
                <Pressable style={styles.shareBtn} onPress={shareLink} testID="share-native">
                  <Ionicons name="share-outline" size={18} color={colors.text} />
                  <Text style={styles.shareBtnText}>Share</Text>
                </Pressable>
                <Pressable style={styles.shareBtn} onPress={copyLink} testID="share-copy">
                  <Ionicons name="link-outline" size={18} color={colors.text} />
                  <Text style={styles.shareBtnText}>Copy link</Text>
                </Pressable>
                {data.share.qr_url && (
                  <Pressable style={styles.shareBtn} onPress={() => setShowQr((v) => !v)} testID="share-qr">
                    <Ionicons name="qr-code-outline" size={18} color={colors.text} />
                    <Text style={styles.shareBtnText}>QR</Text>
                  </Pressable>
                )}
              </View>
              {showQr && (
                <View style={styles.qrCard}>
                  <QRCode value={data.share.passport_url} size={180} />
                  <Text style={styles.qrCaption}>{data.share.passport_url}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {tab === "listings" && (
          <View style={styles.section}>
            <SectionTitle title="Current listings" caption="All active listings for this physical property" />
            {data.listings.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="pricetag-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>No active listings right now.</Text>
              </View>
            ) : (
              data.listings.map((l) => (
                <View key={l.id} style={[styles.listingCard, shadows.soft]}>
                  <View style={styles.listingTop}>
                    <View style={styles.listingTypeChip}>
                      <Text style={styles.listingTypeChipText}>{(l.listing_type ?? "buy").toUpperCase()}</Text>
                    </View>
                    <StatusPill status={l.listing_status} />
                  </View>
                  {l.price != null && <Text style={styles.listingPrice}>{formatNaira(l.price)}</Text>}
                  {l.description && (
                    <Text style={styles.listingDesc} numberOfLines={3}>{l.description}</Text>
                  )}
                  <Text style={styles.listingMeta}>Listed {formatDate(l.created_at)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === "history" && (
          <View style={styles.section}>
            <SectionTitle title="Property timeline" caption="Public history for this AMASS ID" />
            {data.timeline.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="time-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>No public events yet.</Text>
              </View>
            ) : (
              <View style={styles.timeline}>
                {data.timeline.map((e, i) => (
                  <View key={i} style={styles.timelineRow}>
                    <View style={styles.timelineDot} />
                    {i < data.timeline.length - 1 && <View style={styles.timelineLine} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineLabel}>{e.label}</Text>
                      <Text style={styles.timelineDate}>{formatDate(e.at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Sticky enquiry CTA */}
      {data.share.allow_enquiries && (
        <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={styles.enquireBtn}
            onPress={() => {
              if (data.representatives[0]?.agent?.slug) {
                router.push(`/agent/${data.representatives[0].agent.slug}` as any);
              } else {
                Alert.alert("No representative yet", "This property does not have a verified agent yet.");
              }
            }}
            testID="enquire-btn"
          >
            <Ionicons name="chatbubbles" size={18} color="#fff" />
            <Text style={styles.enquireText}>Enquire about this property</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Fact({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <Text style={styles.factText}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {caption && <Text style={styles.sectionCaption}>{caption}</Text>}
    </View>
  );
}

function StatusPill({ status }: { status?: string }) {
  const s = (status ?? "").toUpperCase();
  const c =
    s === "ACTIVE" || s === "APPROVED"
      ? colors.emerald
      : s === "PENDING_REVIEW"
      ? colors.gold
      : s === "SOLD" || s === "RENTED"
      ? colors.textTertiary
      : colors.textTertiary;
  return (
    <View style={[styles.statusPill, { backgroundColor: c }]}>
      <Text style={styles.statusPillText}>{s.replace(/_/g, " ")}</Text>
    </View>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    backgroundColor: colors.bg,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 12, color: colors.textTertiary, fontWeight: "700" },
  headerAmassId: { ...typography.h2, fontSize: 15 },

  errorBox: { padding: spacing.xl, alignItems: "center", gap: 8, marginTop: 40 },
  errorTitle: { ...typography.h2, fontSize: 18 },
  errorSub: { ...typography.body, color: colors.textTertiary, textAlign: "center" },

  hero: {
    width: "100%",
    height: 260,
    backgroundColor: colors.surfaceSecondary,
    position: "relative",
  },
  heroImg: { width: "100%", height: "100%" },
  heroOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 8,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.emerald,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  verifiedBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  priceChip: {
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    ...shadows.soft,
  },
  priceChipText: { fontSize: 18, fontWeight: "900", color: colors.text },
  priceChipSub: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.4 },

  section: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  title: { ...typography.display, fontSize: 24 },
  area: { ...typography.body, color: colors.textSecondary, fontWeight: "600", marginTop: 4 },
  factsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  factText: { fontSize: 12, fontWeight: "700", color: colors.text },

  tabs: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    marginTop: 10,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.pill },
  tabActive: { backgroundColor: "#fff", ...shadows.soft },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.textTertiary },
  tabTextActive: { color: colors.text, fontWeight: "800" },

  sectionTitle: { ...typography.h2, fontSize: 16 },
  sectionCaption: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },

  mapWrap: {
    height: 200,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  pinDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.text },

  repCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  repAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  repAvatarImg: { width: "100%", height: "100%" },
  repName: { fontSize: 14, fontWeight: "800", color: colors.text },
  repAgency: { fontSize: 12, color: colors.textTertiary, fontWeight: "600" },
  repBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  repBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  repMeta: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },

  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  photoWrap: {
    width: (W - 2 * 24 - 12) / 2,
    aspectRatio: 1.3,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  photo: { width: "100%", height: "100%" },

  shareRow: { flexDirection: "row", gap: 8 },
  shareBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  shareBtnText: { fontSize: 13, fontWeight: "700", color: colors.text },
  qrCard: {
    marginTop: 14,
    padding: 20,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  qrCaption: { fontSize: 10, color: colors.textTertiary, textAlign: "center" },

  listingCard: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    marginBottom: 10,
    gap: 6,
  },
  listingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  listingTypeChip: {
    backgroundColor: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  listingTypeChipText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusPillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  listingPrice: { fontSize: 20, fontWeight: "900", color: colors.text },
  listingDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  listingMeta: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },

  emptyBox: {
    padding: 24,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  emptyText: { fontSize: 12, color: colors.textTertiary, fontWeight: "600" },

  timeline: { gap: 4 },
  timelineRow: { flexDirection: "row", gap: 12, paddingVertical: 8, position: "relative" },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.red,
    marginTop: 6,
  },
  timelineLine: {
    position: "absolute",
    left: 4.5,
    top: 20,
    bottom: -8,
    width: 1,
    backgroundColor: colors.divider,
  },
  timelineLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  timelineDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },

  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  enquireBtn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  enquireText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
