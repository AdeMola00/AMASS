/**
 * Admin — Property Discovery Duplicate Review (Phase D-4)
 *
 * Side-by-side comparison of a Google Places candidate against the top
 * matching AMASS properties. Admin can choose:
 *   • MERGE          → attach candidate to an existing property
 *   • MARK RELATED   → link candidate to a nearby property (kept independent)
 *   • KEEP SEPARATE  → clear the duplicate lock; candidate becomes a new lead
 * Every decision is written to discovery_admin_overrides + property_audit_logs.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { PropertyTypeChip } from "@/src/components/PropertyTypeChip";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { radius, shadows, spacing, typography } from "@/src/constants/theme";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

type Review = Awaited<ReturnType<typeof api.adminCandidateReview>>;
type Match = Review["matches"][number];
type PendingAction = { action: "MERGE" | "MARK_RELATED" | "KEEP_SEPARATE"; target?: Match };

export default function DuplicateReviewScreen() {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const router = useRouter();
  const { user } = useAuth();
  const { candidate_id } = useLocalSearchParams<{ candidate_id: string }>();

  const [data, setData] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!candidate_id) return;
    setLoading(true);
    try {
      const r = await api.adminCandidateReview(String(candidate_id));
      setData(r);
    } catch (e: any) {
      Alert.alert("Failed to load", e?.message ?? "Try again");
    } finally {
      setLoading(false);
    }
  }, [candidate_id]);

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false);
      return;
    }
    load();
  }, [user, load]);

  const openAction = (action: PendingAction["action"], target?: Match) => {
    Haptics.selectionAsync().catch(() => {});
    setPending({ action, target });
    setReason("");
  };

  const submitDecision = async () => {
    if (!pending || !candidate_id) return;
    if ((pending.action === "MERGE" || pending.action === "MARK_RELATED") && !pending.target) return;
    setSubmitting(true);
    try {
      const res = await api.adminCandidateResolve(String(candidate_id), {
        action: pending.action,
        amass_property_id: pending.target?.amass_property_id,
        reason: reason.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const done =
        res.action === "MERGE"
          ? `Candidate merged into ${res.amass_property_id}.`
          : res.action === "MARK_RELATED"
          ? `Candidate linked as related to ${res.amass_property_id}.`
          : `Candidate cleared — can now be promoted as a new AMASS lead.`;
      Alert.alert("Done", done, [
        {
          text: "Back to Discovery",
          onPress: () => router.replace("/admin/discovery" as any),
        },
      ]);
      setPending(null);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
    } finally {
      setSubmitting(false);
    }
  };

  // Map region: fit candidate + matches
  const region = useMemo(() => {
    if (!data?.candidate?.latitude || !data.candidate?.longitude) return null;
    const lats = [data.candidate.latitude, ...data.matches.map((m) => m.latitude ?? data.candidate.latitude!)];
    const lngs = [data.candidate.longitude, ...data.matches.map((m) => m.longitude ?? data.candidate.longitude!)];
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latDelta = Math.max(0.003, (maxLat - minLat) * 2.5);
    const lngDelta = Math.max(0.003, (maxLng - minLng) * 2.5);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [data]);

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Duplicate Review" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={40} color={colors.red} />
          <Text style={styles.blockedText}>Admins only</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Duplicate Review" onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Duplicate Review" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Ionicons name="alert-circle" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Candidate not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cand = data.candidate;
  const resolved = !!cand.promoted_to_amass_property_id || cand.status === "ARCHIVED";

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-dup-review">
      <Header title="Duplicate Review" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: 14, paddingBottom: 60 }}>
        {/* Recommendation banner */}
        <View
          style={[
            styles.banner,
            data.recommended_action === "high_confidence_duplicate"
              ? styles.bannerRed
              : data.recommended_action === "possible_duplicate"
              ? styles.bannerGold
              : styles.bannerGreen,
          ]}
        >
          <Ionicons
            name={
              data.recommended_action === "high_confidence_duplicate"
                ? "warning"
                : data.recommended_action === "possible_duplicate"
                ? "help-circle"
                : "checkmark-circle"
            }
            size={18}
            color="#fff"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerText}>
              {data.recommended_action === "high_confidence_duplicate"
                ? "High-confidence duplicate suggested"
                : data.recommended_action === "possible_duplicate"
                ? "Possible duplicate — admin decision needed"
                : "No duplicates detected"}
            </Text>
            <Text style={styles.bannerSub}>Top score: {data.highest_score}</Text>
          </View>
        </View>

        {/* Candidate card */}
        <View style={[styles.card, shadows.soft]}>
          <View style={styles.rowBetween}>
            <View style={styles.chipCandidate}>
              <Ionicons name="flask" size={11} color="#fff" />
              <Text style={styles.chipCandidateText}>CANDIDATE</Text>
            </View>
            <View style={styles.chipStatus}>
              <Text style={styles.chipStatusText}>{cand.status}</Text>
            </View>
          </View>
          <Text style={styles.candName}>{cand.name ?? "(no name)"}</Text>
          <Text style={styles.candAddr} numberOfLines={3}>{cand.address ?? "(no address)"}</Text>
          <View style={styles.metaRow}>
            <MetaChip icon="pricetag" label={cand.candidate_type ?? "UNKNOWN"} />
            {cand.latitude != null && cand.longitude != null && (
              <MetaChip icon="navigate" label={`${cand.latitude.toFixed(5)}, ${cand.longitude.toFixed(5)}`} />
            )}
          </View>
          {(cand.google_types ?? []).length > 0 && (
            <View style={styles.typesRow}>
              {(cand.google_types ?? []).slice(0, 6).map((t) => (
                <View key={t} style={styles.typePill}>
                  <Text style={styles.typePillText}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Map */}
        {region && (
          <View style={[styles.card, { padding: 0, overflow: "hidden" }, shadows.soft]}>
            <View style={styles.mapWrap}>
              <MapView
                style={StyleSheet.absoluteFill}
                provider={PROVIDER_DEFAULT}
                initialRegion={region}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                testID="dup-review-map"
              >
                {cand.latitude != null && cand.longitude != null && (
                  <Marker
                    coordinate={{ latitude: cand.latitude, longitude: cand.longitude }}
                    title="Candidate"
                    testID="marker-candidate"
                  >
                    <View style={[styles.pin, { backgroundColor: colors.gold }]}>
                      <Ionicons name="flask" size={12} color="#fff" />
                    </View>
                  </Marker>
                )}
                {data.matches.map((m, i) =>
                  m.latitude != null && m.longitude != null ? (
                    <Marker
                      key={m.amass_property_id}
                      coordinate={{ latitude: m.latitude, longitude: m.longitude }}
                      title={m.amass_property_id}
                      description={`${m.distance_meters}m • score ${m.score}`}
                    >
                      <View style={[styles.pin, { backgroundColor: colors.red }]}>
                        <Text style={styles.pinNum}>{i + 1}</Text>
                      </View>
                    </Marker>
                  ) : null
                )}
              </MapView>
            </View>
            <View style={styles.mapLegend}>
              <LegendItem color={colors.gold} label="Candidate" />
              <LegendItem color={colors.red} label={`${data.matches.length} nearby AMASS`} />
            </View>
          </View>
        )}

        {/* Matches */}
        <Text style={styles.sectionTitle}>
          {data.matches.length} nearby AMASS propert{data.matches.length === 1 ? "y" : "ies"}
        </Text>

        {data.matches.length === 0 && (
          <View style={[styles.card, shadows.soft, { alignItems: "center", padding: 20 }]}>
            <Ionicons name="checkmark-done-circle" size={32} color={colors.emerald} />
            <Text style={styles.emptyTitle}>No matches in radius</Text>
            <Text style={styles.emptySub}>Safe to keep as separate — click below to unlock promotion.</Text>
          </View>
        )}

        {data.matches.map((m, i) => (
          <View key={m.amass_property_id} style={[styles.card, shadows.soft]}>
            <View style={styles.rowBetween}>
              <View style={styles.chipAmass}>
                <Ionicons name="home" size={11} color="#fff" />
                <Text style={styles.chipCandidateText}>#{i + 1} {m.amass_property_id}</Text>
              </View>
              <View style={styles.scorePill}>
                <Text style={styles.scorePillText}>SCORE {m.score}</Text>
              </View>
            </View>
            <Text style={styles.candName}>
              {[m.estate, m.street, m.area].filter(Boolean).join(" · ") || m.raw_address || "—"}
            </Text>
            <Text style={styles.candAddr} numberOfLines={2}>
              {[m.area, m.lga, m.state].filter(Boolean).join(", ")}
            </Text>
            <View style={styles.metaRow}>
              <PropertyTypeChip type={m.property_type} variant="soft" size="sm" />
              <MetaChip icon="location" label={`${m.distance_meters}m away`} />
              <MetaChip icon="business" label={`${m.listings_count ?? 0} listing${(m.listings_count ?? 0) === 1 ? "" : "s"}`} />
              <MetaChip icon="people" label={`${m.representations_count ?? 0} rep${(m.representations_count ?? 0) === 1 ? "" : "s"}`} />
            </View>
            {m.reasons.length > 0 && (
              <View style={styles.reasonsBox}>
                {m.reasons.map((r) => (
                  <View key={r} style={styles.reasonChip}>
                    <Ionicons name="information-circle" size={10} color={colors.textSecondary} />
                    <Text style={styles.reasonText}>{r}</Text>
                  </View>
                ))}
              </View>
            )}
            {!resolved && (
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionBtn, styles.mergeBtn]}
                  onPress={() => openAction("MERGE", m)}
                  testID={`btn-merge-${m.amass_property_id}`}
                >
                  <Ionicons name="git-merge" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Merge</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.relatedBtn]}
                  onPress={() => openAction("MARK_RELATED", m)}
                  testID={`btn-related-${m.amass_property_id}`}
                >
                  <Ionicons name="link" size={14} color={colors.text} />
                  <Text style={[styles.actionBtnText, { color: colors.text }]}>Related</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.viewBtn]}
                  onPress={() =>
                    router.push(`/property-passport/${m.amass_property_id}` as any)
                  }
                  testID={`btn-view-${m.amass_property_id}`}
                >
                  <Ionicons name="eye" size={14} color={colors.text} />
                </Pressable>
              </View>
            )}
          </View>
        ))}

        {/* Keep separate — always available if not resolved */}
        {!resolved && (
          <Pressable
            style={styles.keepSeparateBtn}
            onPress={() => openAction("KEEP_SEPARATE")}
            testID="btn-keep-separate"
          >
            <Ionicons name="git-branch" size={16} color={colors.text} />
            <Text style={styles.keepSeparateText}>Keep Separate — allow as new lead</Text>
          </Pressable>
        )}

        {/* Resolved banner */}
        {resolved && (
          <View style={[styles.banner, styles.bannerEmerald]}>
            <Ionicons name="lock-closed" size={16} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerText}>Candidate resolved</Text>
              <Text style={styles.bannerSub}>
                {cand.review_notes ?? "See override history below."}
              </Text>
            </View>
          </View>
        )}

        {/* Override history */}
        {data.override_history.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Override history</Text>
            {data.override_history.map((o) => (
              <View key={o.id} style={styles.historyRow}>
                <View style={styles.historyDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyAction}>{o.action}</Text>
                  {o.amass_property_id && (
                    <Text style={styles.historyMeta}>Property: {o.amass_property_id}</Text>
                  )}
                  {o.reason && <Text style={styles.historyReason}>“{o.reason}”</Text>}
                  <Text style={styles.historyMeta}>
                    {o.actor_email ?? "admin"} • {new Date(o.created_at).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Decision modal */}
      <Modal
        visible={!!pending}
        transparent
        animationType="fade"
        onRequestClose={() => setPending(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>
                {pending?.action === "MERGE"
                  ? "Confirm merge"
                  : pending?.action === "MARK_RELATED"
                  ? "Mark as related"
                  : "Keep as separate property"}
              </Text>
              <Pressable onPress={() => setPending(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            {pending?.target && (
              <Text style={styles.modalSub}>
                {pending.action === "MERGE"
                  ? `Attach this candidate to ${pending.target.amass_property_id}. The candidate becomes an alias — no new AMASS ID created.`
                  : `Link this candidate to ${pending.target.amass_property_id} for reference. The candidate stays independent and can still be promoted.`}
              </Text>
            )}
            {pending?.action === "KEEP_SEPARATE" && (
              <Text style={styles.modalSub}>
                Duplicate lock will be cleared. The candidate can then be promoted as a fresh AMASS property.
              </Text>
            )}
            <Text style={styles.fieldLbl}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Different unit inside the same estate"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              testID="input-reason"
            />
            <Pressable
              style={[styles.confirmBtn, submitting && { opacity: 0.6 }]}
              onPress={submitDecision}
              disabled={submitting}
              testID="btn-confirm-decision"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {pending?.action === "MERGE"
                    ? "Merge into property"
                    : pending?.action === "MARK_RELATED"
                    ? "Mark as related"
                    : "Keep separate"}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack} testID="btn-back">
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

function MetaChip({ icon, label }: { icon: any; label: string }) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={11} color={colors.textSecondary} />
      <Text style={styles.metaChipText}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },
  card: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, gap: 8 },
  banner: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  bannerRed: { backgroundColor: colors.red },
  bannerGold: { backgroundColor: colors.gold },
  bannerGreen: { backgroundColor: colors.emerald },
  bannerEmerald: { backgroundColor: colors.emerald },
  bannerText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  bannerSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chipCandidate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignSelf: "flex-start",
  },
  chipAmass: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignSelf: "flex-start",
  },
  chipCandidateText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  chipStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  chipStatusText: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4 },
  scorePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  scorePillText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  candName: { fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 4 },
  candAddr: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  metaChipText: { fontSize: 10, fontWeight: "700", color: colors.textSecondary },
  typesRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  typePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  typePillText: { fontSize: 9, color: colors.textTertiary, fontWeight: "700" },
  reasonsBox: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  reasonChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "#FFF8E7",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gold,
  },
  reasonText: { fontSize: 10, fontWeight: "700", color: colors.text },
  mapWrap: { height: 220, backgroundColor: colors.surfaceSecondary },
  mapLegend: { flexDirection: "row", padding: 10, gap: 14, backgroundColor: colors.surface },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    ...shadows.soft,
  },
  pinNum: { color: "#fff", fontSize: 11, fontWeight: "800" },
  sectionTitle: { ...typography.h2, fontSize: 14, marginTop: 8, letterSpacing: 0.3 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
  },
  mergeBtn: { backgroundColor: colors.ink },
  relatedBtn: { backgroundColor: colors.surfaceSecondary },
  viewBtn: { backgroundColor: colors.surfaceSecondary, flex: 0, width: 48 },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  keepSeparateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    marginTop: 6,
  },
  keepSeparateText: { fontSize: 13, fontWeight: "800", color: colors.text, letterSpacing: 0.3 },
  historyRow: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink,
    marginTop: 6,
  },
  historyAction: { fontSize: 12, fontWeight: "800", color: colors.text },
  historyMeta: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  historyReason: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 4,
  },
  empty: { padding: spacing.xl, alignItems: "center", gap: 8, marginTop: 60 },
  emptyTitle: { ...typography.h2, fontSize: 16 },
  emptySub: { fontSize: 12, color: colors.textTertiary, textAlign: "center" },
  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  blockedText: { fontSize: 14, color: colors.text, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: spacing.xl,
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    gap: 10,
  },
  modalTitle: { ...typography.h2, fontSize: 16 },
  modalSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  fieldLbl: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.4,
    marginTop: 6,
  },
  input: {
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    textAlignVertical: "top",
  },
  confirmBtn: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  confirmBtnText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
});
