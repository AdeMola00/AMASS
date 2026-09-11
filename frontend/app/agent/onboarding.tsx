/**
 * Agent Property Onboarding Wizard — Phase 6C UI
 * 5 stages: Location → Property → Details → Photos → Review
 *
 * Backend contract (Phase 6A/6B):
 *   POST   /agent/properties/onboarding           → start (idempotent by client_submission_id)
 *   POST   /agent/properties/:oid/location        → save location + address
 *   PATCH  /agent/properties/:oid                 → save details / listing / media_ids
 *   POST   /agent/properties/:oid/duplicate-check → run geospatial + fuzzy scoring
 *   POST   /agent/properties/:oid/decision        → agent chooses same/not-same when flagged
 *   POST   /agent/properties/:oid/submit          → commits properties_geo + property_listings
 *
 * Resilience:
 *   • Draft persisted to AsyncStorage under a client_submission_id (idempotency key).
 *   • Every stage saves both locally AND to the server; a failed network save
 *     never blocks the user from continuing — the draft is retried on next save.
 *   • Duplicate action ≥ possible_threshold pops a decision sheet BEFORE submit.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import { MapView, Marker, PROVIDER_DEFAULT, Region } from "@/src/lib/map";

import { api } from "@/src/lib/api";
import {
  clearActiveDraft,
  loadActiveDraft,
  newDraft,
  OnboardingDraft,
  saveDraft,
  WizardStep,
} from "@/src/lib/onboarding-draft";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

// ─── Constants ────────────────────────────────────────────────────────────
const STAGES: { key: WizardStep; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 0, label: "Location", icon: "location" },
  { key: 1, label: "Property", icon: "home" },
  { key: 2, label: "Listing", icon: "pricetag" },
  { key: 3, label: "Photos", icon: "images" },
  { key: 4, label: "Review", icon: "shield-checkmark" },
];

const NIGERIAN_STATES = [
  "Lagos", "FCT", "Ogun", "Oyo", "Rivers", "Kano", "Kaduna", "Enugu", "Anambra", "Delta",
  "Edo", "Cross River", "Akwa Ibom", "Abia", "Imo",
];

const PROPERTY_TYPES = [
  "Apartment", "Duplex", "Bungalow", "Terrace", "Penthouse",
  "Detached", "Semi-Detached", "Land", "Commercial", "Shop", "Office", "Warehouse",
];

const AMENITIES = [
  "Swimming Pool", "Gym", "24/7 Security", "Smart Home", "Solar Power",
  "CCTV", "Borehole", "BQ", "Garden", "Parking", "Furnished", "Elevator",
];

const LISTING_TYPES: { key: "buy" | "rent" | "lease" | "shortlet"; label: string; caption: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "buy", label: "For Sale", caption: "Sell outright", icon: "pricetag" },
  { key: "rent", label: "For Rent", caption: "Yearly rental", icon: "key" },
  { key: "shortlet", label: "Short Let", caption: "Nightly stays", icon: "calendar" },
  { key: "lease", label: "For Lease", caption: "Commercial", icon: "document-text" },
];

const REPRESENTATION_TYPES: { key: "owner" | "agent" | "agency" | "developer" | "landlord"; label: string }[] = [
  { key: "owner", label: "I'm the owner" },
  { key: "landlord", label: "Landlord" },
  { key: "agent", label: "Agent" },
  { key: "agency", label: "Agency" },
  { key: "developer", label: "Developer" },
];

const DEFAULT_COORDS = { latitude: 6.4361, longitude: 3.4739 }; // Lagos default

// ─── Component ────────────────────────────────────────────────────────────
export default function AgentOnboardingWizard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<WizardStep>(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<OnboardingDraft | null>(null);
  const [duplicateSheet, setDuplicateSheet] = useState<{
    open: boolean;
    result?: Awaited<ReturnType<typeof api.onboardingDuplicateCheck>>;
  }>({ open: false });

  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  // ── Bootstrap: resume active draft or start fresh ──
  useEffect(() => {
    (async () => {
      try {
        const existing = await loadActiveDraft();
        if (existing?.onboarding_id) {
          setPendingDraft(existing);
          setShowResumePrompt(true);
        } else {
          const fresh = await newDraft();
          setDraft(fresh);
        }
      } catch {
        const fresh = await newDraft();
        setDraft(fresh);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const resumeExisting = useCallback(async () => {
    if (!pendingDraft) return;
    setDraft(pendingDraft);
    setStep(pendingDraft.step ?? 0);
    setShowResumePrompt(false);
  }, [pendingDraft]);

  const startFresh = useCallback(async () => {
    await clearActiveDraft();
    const fresh = await newDraft();
    setDraft(fresh);
    setStep(0);
    setShowResumePrompt(false);
  }, []);

  // ── Draft persistence helpers ──
  const patchDraft = useCallback(
    async (patch: Partial<OnboardingDraft>) => {
      if (!draft) return;
      const next: OnboardingDraft = { ...draft, ...patch };
      setDraft(next);
      await saveDraft(next);
    },
    [draft]
  );

  const ensureOnboardingId = useCallback(async (): Promise<string> => {
    if (!draft) throw new Error("No draft");
    if (draft.onboarding_id) return draft.onboarding_id;
    const res = await api.onboardingStart(draft.client_submission_id);
    await patchDraft({ onboarding_id: res.onboarding_id });
    return res.onboarding_id;
  }, [draft, patchDraft]);

  // ── Navigation ──
  const goNext = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    if (step < 4) {
      const next = ((step + 1) as WizardStep);
      setStep(next);
      await patchDraft({ step: next });
    }
  }, [step, patchDraft]);

  const goBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (step === 0) {
      router.back();
    } else {
      setStep(((step - 1) as WizardStep));
    }
  }, [step, router]);

  // ── Stage 1: Save Location ──
  const saveStage1 = useCallback(async (): Promise<boolean> => {
    if (!draft?.location) {
      Alert.alert("Location needed", "Capture GPS or drop a pin before continuing.");
      return false;
    }
    if (!draft.address?.state) {
      Alert.alert("Address needed", "Select at least a state before continuing.");
      return false;
    }
    setSaving(true);
    try {
      const oid = await ensureOnboardingId();
      await api.onboardingSaveLocation(oid, draft.location, draft.address);
      return true;
    } catch (e: any) {
      Alert.alert("Could not save location", e?.message ?? "Please try again");
      return false;
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }, [draft, ensureOnboardingId]);

  // ── Stage 2 + 3: save details/listing ──
  const saveStage2 = useCallback(async (): Promise<boolean> => {
    if (!draft?.details?.property_type) {
      Alert.alert("Missing", "Pick a property type first.");
      return false;
    }
    setSaving(true);
    try {
      const oid = await ensureOnboardingId();
      await api.onboardingSaveDetails(oid, { details: draft.details });
      return true;
    } catch (e: any) {
      Alert.alert("Could not save details", e?.message ?? "Please try again");
      return false;
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }, [draft, ensureOnboardingId]);

  const saveStage3 = useCallback(async (): Promise<boolean> => {
    if (!draft?.listing?.listing_type || !draft?.listing?.price) {
      Alert.alert("Missing", "Listing type and price are required.");
      return false;
    }
    setSaving(true);
    try {
      const oid = await ensureOnboardingId();
      await api.onboardingSaveDetails(oid, { listing: draft.listing });
      return true;
    } catch (e: any) {
      Alert.alert("Could not save listing", e?.message ?? "Please try again");
      return false;
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }, [draft, ensureOnboardingId]);

  // ── Stage 4: photos ──
  const saveStage4 = useCallback(async (): Promise<boolean> => {
    if (!draft?.media_ids?.length) {
      Alert.alert("Photos", "Please add at least one photo.");
      return false;
    }
    setSaving(true);
    try {
      const oid = await ensureOnboardingId();
      await api.onboardingSaveDetails(oid, { media_ids: draft.media_ids });
      return true;
    } catch (e: any) {
      Alert.alert("Could not save photos", e?.message ?? "Please try again");
      return false;
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }, [draft, ensureOnboardingId]);

  // ── Stage 5: duplicate check + submit ──
  const runDuplicateCheck = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const oid = await ensureOnboardingId();
      const result = await api.onboardingDuplicateCheck(oid);
      await patchDraft({ duplicate_action: result.action });
      if (result.action === "allow") {
        return { ok: true, action: result.action, result };
      }
      // Show decision sheet
      setDuplicateSheet({ open: true, result });
      return { ok: false, action: result.action, result };
    } catch (e: any) {
      Alert.alert("Duplicate check failed", e?.message ?? "Please try again");
      return { ok: false, action: "allow" as const };
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }, [draft, ensureOnboardingId, patchDraft]);

  const submitOnboarding = useCallback(async () => {
    if (!draft?.onboarding_id) return;
    setSubmitting(true);
    try {
      const res = await api.onboardingSubmit(draft.onboarding_id, draft.client_submission_id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await clearActiveDraft();
      Alert.alert(
        res.attached_to_existing ? "Attached to existing property" : "Listing submitted",
        `AMASS ID: ${res.amass_property_id}\n\nA PENDING representation was created for you. Upload your mandate documents next.`,
        [
          {
            text: "View Passport",
            onPress: () => router.replace(`/property-passport/${res.amass_property_id}` as any),
          },
          {
            text: "My Representations",
            onPress: () => router.replace("/agent/representations" as any),
            style: "default",
          },
        ]
      );
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("duplicate_decision_required") || msg.includes("possible existing")) {
        await runDuplicateCheck();
      } else {
        Alert.alert("Could not submit", msg || "Please try again");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  }, [draft, router, runDuplicateCheck]);

  const handlePrimaryPress = useCallback(async () => {
    if (!draft) return;
    if (step === 0) {
      if (await saveStage1()) await goNext();
    } else if (step === 1) {
      if (await saveStage2()) await goNext();
    } else if (step === 2) {
      if (await saveStage3()) await goNext();
    } else if (step === 3) {
      if (await saveStage4()) await goNext();
    } else if (step === 4) {
      // Run dup check first if not yet done; if allow, submit.
      const dup = await runDuplicateCheck();
      if (dup?.ok && dup.action === "allow") {
        await submitOnboarding();
      }
    }
  }, [step, draft, saveStage1, saveStage2, saveStage3, saveStage4, goNext, runDuplicateCheck, submitOnboarding]);

  // ── Duplicate sheet actions ──
  const recordDecision = useCallback(
    async (decision: "same_property" | "not_same_property", opts?: { same_as_amass_id?: string; reason?: string }) => {
      if (!draft?.onboarding_id) return;
      try {
        await api.onboardingRecordDecision(draft.onboarding_id, {
          client_submission_id: draft.client_submission_id,
          duplicate_decision: decision,
          same_as_amass_id: opts?.same_as_amass_id,
          not_same_reason: opts?.reason,
        });
        await patchDraft({ duplicate_decision: decision });
        setDuplicateSheet({ open: false });
        // Now submit
        await submitOnboarding();
      } catch (e: any) {
        Alert.alert("Could not record decision", e?.message ?? "Please try again");
      }
    },
    [draft, patchDraft, submitOnboarding]
  );

  // ── Render ──
  if (loading || !draft) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="onboarding-wizard">
      {/* Header + Progress */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconBtn} testID="wiz-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.stepLbl}>Step {step + 1} of {STAGES.length}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((step + 1) / STAGES.length) * 100}%` }]} />
          </View>
          <Text style={styles.stageTitle}>{STAGES[step].label}</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {/* Stage stepper */}
      <View style={styles.stepper}>
        {STAGES.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <View key={s.key} style={styles.stepperCell}>
              <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Ionicons name={s.icon} size={12} color={active ? "#fff" : colors.textTertiary} />
                )}
              </View>
              <Text style={[styles.stepDotLbl, active && { color: colors.text, fontWeight: "800" }]}>{s.label}</Text>
              {i < STAGES.length - 1 && <View style={[styles.stepLine, done && { backgroundColor: colors.emerald }]} />}
            </View>
          );
        })}
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={90}
      >
        {step === 0 && <StageLocation draft={draft} patchDraft={patchDraft} />}
        {step === 1 && <StageProperty draft={draft} patchDraft={patchDraft} />}
        {step === 2 && <StageListing draft={draft} patchDraft={patchDraft} />}
        {step === 3 && <StagePhotos draft={draft} patchDraft={patchDraft} />}
        {step === 4 && <StageReview draft={draft} />}
      </KeyboardAwareScrollView>

      {/* Sticky bottom bar */}
      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          onPress={handlePrimaryPress}
          disabled={saving || submitting}
          style={[styles.cta, (saving || submitting) && { opacity: 0.5 }]}
          testID="wiz-primary"
        >
          {saving || submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              {step === 4 ? "Check & Submit" : "Continue"}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Resume prompt */}
      <Modal visible={showResumePrompt} transparent animationType="fade" onRequestClose={startFresh}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons name="time-outline" size={28} color={colors.red} />
            <Text style={styles.modalTitle}>Resume where you left off?</Text>
            <Text style={styles.modalBody}>
              You have an unfinished property submission. Would you like to continue or start over?
            </Text>
            <View style={{ gap: 8, width: "100%" }}>
              <Pressable style={styles.cta} onPress={resumeExisting} testID="wiz-resume">
                <Text style={styles.ctaText}>Resume</Text>
              </Pressable>
              <Pressable style={styles.ctaSecondary} onPress={startFresh} testID="wiz-start-fresh">
                <Text style={styles.ctaSecondaryText}>Start new</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Duplicate decision sheet */}
      <Modal
        visible={duplicateSheet.open}
        transparent
        animationType="slide"
        onRequestClose={() => setDuplicateSheet({ open: false })}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { alignItems: "stretch", maxHeight: "88%" }]}>
            <View style={styles.dupHeader}>
              <View style={styles.dupWarnBadge}>
                <Ionicons name="warning" size={16} color="#fff" />
                <Text style={styles.dupWarnBadgeText}>
                  {duplicateSheet.result?.action === "high_confidence_duplicate"
                    ? "High-Confidence Duplicate"
                    : "Possible Duplicate"}
                </Text>
              </View>
              <Pressable onPress={() => setDuplicateSheet({ open: false })} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </Pressable>
            </View>
            <Text style={styles.modalTitle}>Is this the same property?</Text>
            <Text style={styles.modalBody}>
              We found {duplicateSheet.result?.candidates.length ?? 0} existing propert
              {(duplicateSheet.result?.candidates.length ?? 0) > 1 ? "ies" : "y"} near your pin. Confirm
              before we create a new AMASS ID.
            </Text>

            <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {duplicateSheet.result?.candidates.slice(0, 3).map((c) => (
                <View key={c.amass_property_id} style={styles.candidateCard}>
                  <View style={styles.candidateHeader}>
                    <Text style={styles.candidateId}>{c.amass_property_id}</Text>
                    <View style={[styles.scoreBadge, c.score >= 80 && { backgroundColor: colors.red }]}>
                      <Text style={styles.scoreBadgeText}>{c.score}/100</Text>
                    </View>
                  </View>
                  <Text style={styles.candidateAddr}>
                    {[c.preview.street, c.preview.area, c.preview.lga, c.preview.state]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </Text>
                  <Text style={styles.candidateMeta}>
                    {c.preview.property_type ?? "—"} · {c.distance_meters}m away
                  </Text>
                  {c.reasons.slice(0, 3).map((r, i) => (
                    <View key={i} style={styles.reasonRow}>
                      <Ionicons name="alert-circle" size={12} color={colors.red} />
                      <Text style={styles.reasonText}>{r}</Text>
                    </View>
                  ))}
                  <Pressable
                    style={styles.sameBtn}
                    onPress={() =>
                      recordDecision("same_property", { same_as_amass_id: c.amass_property_id })
                    }
                    testID={`dup-same-${c.amass_property_id}`}
                  >
                    <Ionicons name="link" size={14} color="#fff" />
                    <Text style={styles.sameBtnText}>Same — attach my listing</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <Pressable
              style={[styles.ctaSecondary, { marginTop: 8 }]}
              onPress={() =>
                Alert.prompt
                  ? Alert.prompt("Why is this different?", "e.g. different building, unit, floor", (text) =>
                      recordDecision("not_same_property", { reason: text || "different building" })
                    )
                  : recordDecision("not_same_property", { reason: "different building" })
              }
              testID="dup-not-same"
            >
              <Text style={styles.ctaSecondaryText}>None of these — my property is different</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Stage 1: Location ────────────────────────────────────────────────────
function StageLocation({
  draft,
  patchDraft,
}: {
  draft: OnboardingDraft;
  patchDraft: (patch: Partial<OnboardingDraft>) => Promise<void>;
}) {
  const [locating, setLocating] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.duplicateCheckAdhoc>> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const lastCheckedRef = useRef<string>("");
  const coords = {
    latitude: draft.location?.latitude ?? DEFAULT_COORDS.latitude,
    longitude: draft.location?.longitude ?? DEFAULT_COORDS.longitude,
  };
  const accuracy = draft.location?.accuracy_meters ?? 0;
  const source = draft.location?.location_source;

  // Debounced inline duplicate preview — fires when the pin locks. Uses a
  // signature key so the same coords don't fire multiple network calls.
  useEffect(() => {
    if (!draft.location) return;
    const key = `${draft.location.latitude.toFixed(5)}|${draft.location.longitude.toFixed(5)}|${draft.address?.state ?? ""}`;
    if (lastCheckedRef.current === key) return;
    lastCheckedRef.current = key;
    const t = setTimeout(async () => {
      try {
        setPreviewing(true);
        const r = await api.duplicateCheckAdhoc({
          latitude: draft.location!.latitude,
          longitude: draft.location!.longitude,
          accuracy_meters: draft.location!.accuracy_meters,
          address: draft.address,
        });
        setPreview(r);
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [draft.location, draft.address]);

  const useMyGps = async () => {
    try {
      setLocating(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        if (!perm.canAskAgain) {
          Alert.alert(
            "Location required",
            "Enable location permission in Settings to capture GPS at the property.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ]
          );
        }
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await patchDraft({
        location: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy ?? 15,
          location_source: "GPS",
        },
      });
    } catch (e: any) {
      Alert.alert("GPS unavailable", e?.message ?? "Try again outdoors.");
    } finally {
      setLocating(false);
    }
  };

  const updateMap = (lat: number, lng: number) => {
    patchDraft({
      location: {
        latitude: lat,
        longitude: lng,
        accuracy_meters: draft.location?.accuracy_meters ?? 25,
        location_source: "MAP_SELECTED",
      },
    });
  };

  const setAddressField = (k: keyof NonNullable<OnboardingDraft["address"]>, v: string) => {
    patchDraft({ address: { ...(draft.address ?? { state: "" }), [k]: v } as any });
  };

  const gpsQualityColor =
    !source || source === "MAP_SELECTED"
      ? colors.gold
      : accuracy <= 10
      ? colors.emerald
      : accuracy <= 25
      ? colors.gold
      : colors.red;

  const gpsMessage =
    !source
      ? "Tap 'Use my GPS' at the property, or drop a pin on the map."
      : source === "MAP_SELECTED"
      ? "Pin selected on map. Capture GPS on-site for verification."
      : accuracy <= 10
      ? `Excellent GPS (${accuracy.toFixed(0)}m accuracy).`
      : accuracy <= 25
      ? `Good GPS (${accuracy.toFixed(0)}m).`
      : `Low accuracy (${accuracy.toFixed(0)}m). Move to open air.`;

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.h1}>Where is the property?</Text>
      <Text style={styles.sub}>
        AMASS uses your GPS + address to assign a unique property identity and prevent duplicate listings.
      </Text>

      <Pressable style={styles.gpsBtn} onPress={useMyGps} disabled={locating} testID="loc-use-gps">
        {locating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="locate" size={18} color="#fff" />
            <Text style={styles.gpsBtnText}>Use my GPS location</Text>
          </>
        )}
      </Pressable>

      <View style={styles.mapWrap}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          } as Region}
          region={{
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          } as Region}
          onPress={(e: any) => {
            if (e?.nativeEvent?.coordinate) {
              updateMap(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);
            }
          }}
        >
          {draft.location && (
            <Marker
              coordinate={coords}
              draggable
              onDragEnd={(e: any) =>
                e?.nativeEvent?.coordinate &&
                updateMap(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
              }
            >
              <View style={styles.pinDot}>
                <Ionicons name="home" size={14} color="#fff" />
              </View>
            </Marker>
          )}
        </MapView>
      </View>

      {draft.location && (
        <View style={[styles.gpsChip, { borderColor: gpsQualityColor }]}>
          <View style={[styles.gpsChipDot, { backgroundColor: gpsQualityColor }]} />
          <Text style={styles.gpsChipText}>{gpsMessage}</Text>
        </View>
      )}

      {/* Inline duplicate preview — appears as soon as GPS/pin is locked */}
      {draft.location && (previewing || preview) && (
        <View
          style={[
            styles.dupPreview,
            preview?.action === "high_confidence_duplicate" && { backgroundColor: colors.redSurface, borderColor: colors.red },
            preview?.action === "possible_duplicate" && { backgroundColor: colors.goldLight, borderColor: colors.gold },
            preview?.action === "allow" && { backgroundColor: colors.surface, borderColor: colors.emerald },
          ]}
        >
          {previewing ? (
            <View style={styles.dupPreviewRow}>
              <ActivityIndicator size="small" color={colors.textTertiary} />
              <Text style={styles.dupPreviewText}>Checking for existing properties…</Text>
            </View>
          ) : preview?.action === "allow" ? (
            <View style={styles.dupPreviewRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.emerald} />
              <Text style={styles.dupPreviewText}>No duplicates found at this location.</Text>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <View style={styles.dupPreviewRow}>
                <Ionicons
                  name="warning"
                  size={16}
                  color={preview?.action === "high_confidence_duplicate" ? colors.red : colors.gold}
                />
                <Text style={styles.dupPreviewTitle}>
                  {preview?.action === "high_confidence_duplicate"
                    ? `Likely duplicate (${preview?.highest_score}/100)`
                    : `Possible duplicate (${preview?.highest_score}/100)`}
                </Text>
              </View>
              <Text style={styles.dupPreviewText}>
                {preview?.candidates.length ?? 0} existing propert
                {(preview?.candidates.length ?? 0) > 1 ? "ies" : "y"} within{" "}
                {preview?.search_radius_meters}m. You&apos;ll be asked to confirm before submission.
              </Text>
              {preview?.candidates?.[0] && (
                <Text style={styles.dupPreviewNearest}>
                  Nearest: {preview.candidates[0].amass_property_id} · {preview.candidates[0].distance_meters}m away
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      <Text style={styles.subheader}>Address</Text>
      <Text style={styles.fieldLabel}>State</Text>
      <View style={styles.chipWrap}>
        {NIGERIAN_STATES.map((s) => {
          const on = draft.address?.state === s;
          return (
            <Pressable
              key={s}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setAddressField("state", s)}
              testID={`state-${s}`}
            >
              <Text style={[styles.chipText, on && { color: "#fff" }]}>{s}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field
        label="LGA"
        value={draft.address?.lga}
        onChangeText={(v) => setAddressField("lga", v)}
        placeholder="e.g. Eti-Osa"
      />
      <Field
        label="Area / District"
        value={draft.address?.area}
        onChangeText={(v) => setAddressField("area", v)}
        placeholder="e.g. Lekki Phase 1"
      />
      <Field
        label="Estate (optional)"
        value={draft.address?.estate}
        onChangeText={(v) => setAddressField("estate", v)}
        placeholder="e.g. Nicon Town"
      />
      <Field
        label="Street"
        value={draft.address?.street}
        onChangeText={(v) => setAddressField("street", v)}
        placeholder="Street name"
      />
      <View style={styles.row2}>
        <Field
          label="House number"
          value={draft.address?.house_number}
          onChangeText={(v) => setAddressField("house_number", v)}
          placeholder="12A"
          style={{ flex: 1 }}
        />
        <Field
          label="Landmark"
          value={draft.address?.landmark}
          onChangeText={(v) => setAddressField("landmark", v)}
          placeholder="near…"
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

// ─── Stage 2: Property details ────────────────────────────────────────────
function StageProperty({
  draft,
  patchDraft,
}: {
  draft: OnboardingDraft;
  patchDraft: (patch: Partial<OnboardingDraft>) => Promise<void>;
}) {
  const d = draft.details ?? { property_type: "", amenities: [] };
  const setField = (k: keyof NonNullable<OnboardingDraft["details"]>, v: any) => {
    patchDraft({ details: { ...(d as any), [k]: v } });
  };
  const toggleAmenity = (a: string) => {
    const list = d.amenities ?? [];
    setField("amenities", list.includes(a) ? list.filter((x) => x !== a) : [...list, a]);
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.h1}>About the property</Text>
      <Text style={styles.sub}>Buyers filter and compare by these facts.</Text>

      <Text style={styles.subheader}>Property type</Text>
      <View style={styles.chipWrap}>
        {PROPERTY_TYPES.map((p) => {
          const on = d.property_type === p;
          return (
            <Pressable
              key={p}
              onPress={() => setField("property_type", p)}
              style={[styles.chip, on && styles.chipOn]}
              testID={`ptype-${p}`}
            >
              <Text style={[styles.chipText, on && { color: "#fff" }]}>{p}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row2}>
        <NumField label="Bedrooms" value={d.bedrooms} onChange={(v) => setField("bedrooms", v)} />
        <NumField label="Bathrooms" value={d.bathrooms} onChange={(v) => setField("bathrooms", v)} />
      </View>
      <View style={styles.row2}>
        <NumField label="Floors" value={d.floors} onChange={(v) => setField("floors", v)} />
        <NumField label="Year built" value={d.year_built} onChange={(v) => setField("year_built", v)} placeholder="2023" />
      </View>
      <View style={styles.row2}>
        <NumField label="Building size (sqm)" value={d.building_size_sqm} onChange={(v) => setField("building_size_sqm", v)} placeholder="380" />
        <NumField label="Land size (sqm)" value={d.land_size_sqm} onChange={(v) => setField("land_size_sqm", v)} placeholder="600" />
      </View>

      <Text style={styles.subheader}>Amenities</Text>
      <View style={styles.chipWrap}>
        {AMENITIES.map((a) => {
          const on = (d.amenities ?? []).includes(a);
          return (
            <Pressable
              key={a}
              onPress={() => toggleAmenity(a)}
              style={[styles.chip, on && styles.chipOn]}
              testID={`amenity-${a.replace(/\s+/g, "-")}`}
            >
              {on && <Ionicons name="checkmark" size={12} color="#fff" />}
              <Text style={[styles.chipText, on && { color: "#fff" }]}>{a}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Stage 3: Listing ─────────────────────────────────────────────────────
function StageListing({
  draft,
  patchDraft,
}: {
  draft: OnboardingDraft;
  patchDraft: (patch: Partial<OnboardingDraft>) => Promise<void>;
}) {
  const l = draft.listing ?? { listing_type: "buy" as const, price: 0, currency: "NGN" };
  const setField = (k: keyof NonNullable<OnboardingDraft["listing"]>, v: any) => {
    patchDraft({ listing: { ...(l as any), [k]: v } });
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.h1}>How are you listing it?</Text>
      <Text style={styles.sub}>The listing represents your commercial offer for this property.</Text>

      <Text style={styles.subheader}>Listing type</Text>
      <View style={styles.grid2}>
        {LISTING_TYPES.map((t) => {
          const on = l.listing_type === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setField("listing_type", t.key)}
              style={[styles.gridCard, on && styles.gridCardActive]}
              testID={`ltype-${t.key}`}
            >
              <Ionicons name={t.icon} size={20} color={on ? "#fff" : colors.text} />
              <Text style={[styles.gridLabel, on && { color: "#fff" }]}>{t.label}</Text>
              <Text style={[styles.gridCaption, on && { color: "rgba(255,255,255,0.7)" }]}>{t.caption}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Price (₦)"
        keyboardType="numeric"
        value={l.price ? String(l.price) : ""}
        onChangeText={(v) => setField("price", parseInt(v.replace(/[^\d]/g, ""), 10) || 0)}
        placeholder="145000000"
        testID="listing-price"
      />

      <Text style={styles.subheader}>Description</Text>
      <TextInput
        style={[styles.input, { minHeight: 100, textAlignVertical: "top", paddingTop: 14 }]}
        multiline
        placeholder="Describe what makes this property special…"
        placeholderTextColor={colors.textMuted}
        value={l.description ?? ""}
        onChangeText={(v) => setField("description", v)}
        testID="listing-desc"
      />

      <Text style={styles.subheader}>Your role</Text>
      <View style={styles.chipWrap}>
        {REPRESENTATION_TYPES.map((r) => {
          const on = l.representation_type === r.key;
          return (
            <Pressable
              key={r.key}
              onPress={() => setField("representation_type", r.key)}
              style={[styles.chip, on && styles.chipOn]}
              testID={`rep-${r.key}`}
            >
              <Text style={[styles.chipText, on && { color: "#fff" }]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {l.representation_type && l.representation_type !== "owner" && (
        <View style={styles.row2}>
          <Field
            label="Owner name"
            value={l.owner_name}
            onChangeText={(v) => setField("owner_name", v)}
            placeholder="Full name"
            style={{ flex: 1 }}
          />
          <Field
            label="Owner phone"
            value={l.owner_phone}
            onChangeText={(v) => setField("owner_phone", v)}
            keyboardType="phone-pad"
            placeholder="+234…"
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}

// ─── Stage 4: Photos ──────────────────────────────────────────────────────
function StagePhotos({
  draft,
  patchDraft,
}: {
  draft: OnboardingDraft;
  patchDraft: (patch: Partial<OnboardingDraft>) => Promise<void>;
}) {
  const [picking, setPicking] = useState<null | "library" | "camera">(null);
  const media = draft.media_ids ?? [];

  const addImages = (uris: string[]) => {
    patchDraft({ media_ids: [...media, ...uris].slice(0, 12) });
  };

  const removeImage = (u: string) => {
    patchDraft({ media_ids: media.filter((x) => x !== u) });
  };

  const pickFromLibrary = async () => {
    setPicking("library");
    try {
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        if (!canAskAgain) {
          Alert.alert("Photos required", "Grant photo access in Settings to add listing photos.", [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]);
        }
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        allowsMultipleSelection: true,
        selectionLimit: 8,
        quality: 0.5,
        base64: true,
      });
      if (!res.canceled) {
        const uris = res.assets.map((a) => (a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri)).filter(Boolean);
        addImages(uris);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } finally {
      setPicking(null);
    }
  };

  const captureCamera = async () => {
    setPicking("camera");
    try {
      const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        if (!canAskAgain) {
          Alert.alert("Camera required", "Grant camera access in Settings to shoot listing photos.", [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]);
        }
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
      if (!res.canceled) {
        const a = res.assets[0];
        const uri = a?.base64 ? `data:image/jpeg;base64,${a.base64}` : a?.uri;
        if (uri) addImages([uri]);
      }
    } finally {
      setPicking(null);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.h1}>Show it off</Text>
      <Text style={styles.sub}>Add 1–12 photos. The first one is the cover.</Text>

      <View style={styles.pickerRow}>
        <Pressable style={styles.pickerBtn} onPress={pickFromLibrary} disabled={!!picking} testID="pick-lib">
          {picking === "library" ? <ActivityIndicator /> : <><Ionicons name="images" size={18} color={colors.text} /><Text style={styles.pickerBtnText}>Gallery</Text></>}
        </Pressable>
        <Pressable
          style={[styles.pickerBtn, Platform.OS === "web" && { opacity: 0.5 }]}
          onPress={captureCamera}
          disabled={!!picking || Platform.OS === "web"}
          testID="pick-cam"
        >
          {picking === "camera" ? <ActivityIndicator /> : <><Ionicons name="camera" size={18} color={colors.text} /><Text style={styles.pickerBtnText}>Camera</Text></>}
        </Pressable>
      </View>

      {media.length === 0 ? (
        <View style={styles.emptyPhotos}>
          <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyPhotosText}>No photos yet — add at least one to continue.</Text>
        </View>
      ) : (
        <View style={styles.photoGrid}>
          {media.map((u, idx) => (
            <View key={`${idx}-${u.slice(0, 24)}`} style={styles.photoWrap}>
              <Image source={{ uri: u }} style={styles.photo} contentFit="cover" />
              {idx === 0 && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>COVER</Text>
                </View>
              )}
              <Pressable style={styles.removeBtn} onPress={() => removeImage(u)} hitSlop={8}>
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Stage 5: Review ──────────────────────────────────────────────────────
function StageReview({ draft }: { draft: OnboardingDraft }) {
  const addr = draft.address;
  const fullAddr = [addr?.house_number, addr?.street, addr?.estate, addr?.area, addr?.lga, addr?.state]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.h1}>One last look</Text>
      <Text style={styles.sub}>Confirm everything, then AMASS will check for duplicates before creating the listing.</Text>

      {draft.media_ids?.[0] && (
        <View style={styles.previewImgWrap}>
          <Image source={{ uri: draft.media_ids[0] }} style={styles.previewImg} contentFit="cover" />
          {draft.listing?.price ? (
            <View style={styles.previewPrice}>
              <Text style={styles.previewPriceText}>{formatNaira(draft.listing.price)}</Text>
            </View>
          ) : null}
        </View>
      )}

      <ReviewRow label="Address" value={fullAddr || "—"} />
      <ReviewRow label="GPS" value={
        draft.location
          ? `${draft.location.latitude.toFixed(5)}, ${draft.location.longitude.toFixed(5)} · ${draft.location.accuracy_meters?.toFixed(0)}m`
          : "—"
      } />
      <ReviewRow label="Property" value={
        draft.details?.property_type
          ? `${draft.details.property_type}${draft.details.bedrooms ? ` · ${draft.details.bedrooms} bd` : ""}${draft.details.bathrooms ? ` · ${draft.details.bathrooms} ba` : ""}`
          : "—"
      } />
      <ReviewRow label="Listing" value={
        draft.listing
          ? `${draft.listing.listing_type.toUpperCase()} · ${formatNaira(draft.listing.price)}`
          : "—"
      } />
      <ReviewRow label="Photos" value={`${draft.media_ids?.length ?? 0} attached`} />

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark" size={16} color={colors.red} />
        <Text style={styles.noticeText}>
          Before we assign an AMASS ID we&apos;ll compare your pin against nearby properties. If we find a match you&apos;ll
          be asked to confirm whether it&apos;s the same property.
        </Text>
      </View>
    </View>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────
function Field({
  label,
  style,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string; style?: any }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholderTextColor={colors.textMuted}
        value={value != null ? String(value) : ""}
        onChangeText={(v) => {
          const s = v.replace(/[^\d]/g, "");
          onChange(s ? parseInt(s, 10) : undefined);
        }}
        placeholder={placeholder}
      />
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  stepLbl: { fontSize: 11, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.4 },
  stageTitle: { fontSize: 13, fontWeight: "800", color: colors.text, marginTop: 6 },
  progressBar: {
    marginTop: 6,
    width: "80%",
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.red, borderRadius: 2 },

  stepper: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: "flex-start",
  },
  stepperCell: { flex: 1, alignItems: "center", position: "relative" },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { backgroundColor: colors.ink },
  stepDotDone: { backgroundColor: colors.emerald },
  stepDotLbl: { fontSize: 10, color: colors.textTertiary, marginTop: 4 },
  stepLine: {
    position: "absolute",
    top: 12,
    left: "60%",
    right: "-40%",
    height: 2,
    backgroundColor: colors.border,
  },

  h1: { ...typography.display, fontSize: 24 },
  sub: { ...typography.body, color: colors.textTertiary, lineHeight: 20 },
  subheader: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 6,
  },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.3, marginLeft: 4 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.text,
    fontWeight: "500",
  },
  row2: { flexDirection: "row", gap: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },

  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridCard: {
    width: "48%",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 6,
    backgroundColor: "#fff",
    minHeight: 100,
    justifyContent: "flex-end",
  },
  gridCardActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  gridLabel: { fontSize: 15, fontWeight: "800", color: colors.text },
  gridCaption: { fontSize: 11, color: colors.textTertiary, fontWeight: "500" },

  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  gpsBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  mapWrap: {
    height: 220,
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
    ...shadows.soft,
  },
  gpsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: "#fff",
  },
  gpsChipDot: { width: 8, height: 8, borderRadius: 4 },
  gpsChipText: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.text },

  dupPreview: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  dupPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dupPreviewTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  dupPreviewText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    fontWeight: "600",
    lineHeight: 17,
  },
  dupPreviewNearest: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: "600",
    marginLeft: 24,
  },

  pickerRow: { flexDirection: "row", gap: 10 },
  pickerBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pickerBtnText: { fontSize: 14, fontWeight: "700", color: colors.text },
  emptyPhotos: {
    padding: 24,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  emptyPhotosText: { fontSize: 13, color: colors.textTertiary, textAlign: "center", fontWeight: "500" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoWrap: {
    width: "48%",
    aspectRatio: 1.3,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    position: "relative",
  },
  photo: { width: "100%", height: "100%" },
  coverBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: colors.red,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  coverBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },

  previewImgWrap: {
    height: 180,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  previewImg: { width: "100%", height: "100%" },
  previewPrice: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  previewPriceText: { fontSize: 15, fontWeight: "800", color: colors.text },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    gap: 12,
  },
  reviewLabel: { fontSize: 12, color: colors.textTertiary, fontWeight: "600" },
  reviewValue: { fontSize: 13, color: colors.text, fontWeight: "700", flex: 1, textAlign: "right" },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: spacing.md,
    backgroundColor: colors.redSurface,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  noticeText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 18 },

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
  cta: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  ctaSecondary: {
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  ctaSecondaryText: { color: colors.text, fontSize: 14, fontWeight: "800" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    alignItems: "center",
    gap: 12,
  },
  modalTitle: { ...typography.h2, fontSize: 20, textAlign: "center" },
  modalBody: { ...typography.body, color: colors.textTertiary, textAlign: "center", lineHeight: 20 },
  dupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  dupWarnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dupWarnBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  candidateCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  candidateHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  candidateId: { fontSize: 13, fontWeight: "800", color: colors.text },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  scoreBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  candidateAddr: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  candidateMeta: { fontSize: 11, color: colors.textTertiary, fontWeight: "500" },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reasonText: { flex: 1, fontSize: 11, color: colors.text },
  sameBtn: {
    marginTop: 6,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  sameBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
