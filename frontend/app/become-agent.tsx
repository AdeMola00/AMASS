import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { api, AgentPublic } from "@/src/lib/api";
import { AmassLogo } from "@/src/components/AmassLogo";
import { useAuth } from "@/src/contexts/auth";
import { radius, shadows, spacing, typography } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { Button, ProgressBar, Screen, ScreenHeader, Skeleton } from "@/src/ui";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

type Step = 0 | 1 | 2 | 3;

const NIGERIAN_STATES = [
  "Lagos", "FCT", "Ogun", "Oyo", "Rivers", "Kano", "Kaduna", "Enugu", "Anambra", "Delta",
];
const AREAS = [
  "Lagos Island", "Lekki", "Ikoyi", "Victoria Island", "Ikeja", "Yaba", "Ajah",
  "Abuja - Maitama", "Abuja - Asokoro", "Port Harcourt", "Ibadan", "Abeokuta",
];
const SPECIALISATIONS = [
  "Residential Sales", "Residential Rentals", "Commercial", "Land",
  "Luxury", "Short Let", "Student Housing", "Industrial", "Mixed Use",
];

export default function BecomeAgent() {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: tc } = useTheme();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<AgentPublic | null>(null);
  const [checking, setChecking] = useState(true);

  // Form state
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [nin, setNin] = useState("");
  const [idDoc, setIdDoc] = useState<string | undefined>();
  const [selfie, setSelfie] = useState<string | undefined>();
  const [agencyName, setAgencyName] = useState("");
  const [cacNumber, setCacNumber] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [state, setStateVal] = useState("Lagos");
  const [lga, setLga] = useState("");
  const [years, setYears] = useState("2");
  const [areas, setAreas] = useState<string[]>([]);
  const [specs, setSpecs] = useState<string[]>([]);
  const [hasMandateAuthority, setHasMandateAuthority] = useState(false);

  useEffect(() => {
    api
      .agentMe()
      .then((a) => setExisting(a))
      .catch(() => setExisting(null))
      .finally(() => setChecking(false));
  }, []);

  const toggle = (list: string[], value: string, setter: (n: string[]) => void) =>
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  // Prefill the wizard from the submitted application so edit/resubmit isn't a blank form.
  const editApplication = () => {
    if (existing) {
      setFullName(existing.full_name ?? "");
      setPhone(existing.phone ?? "");
      setEmail(existing.email ?? "");
      setAgencyName(existing.agency_name ?? "");
      setOfficeAddress(existing.office_address ?? "");
      setStateVal(existing.state ?? "Lagos");
      setLga(existing.lga ?? "");
      setYears(String(existing.years_experience ?? 2));
      setAreas(existing.areas_of_operation ?? []);
      setSpecs(existing.specialisations ?? []);
    }
    setStep(0);
    setExisting(null);
  };

  const pickPhoto = async (setter: (u: string) => void, mode: "id" | "selfie") => {
    try {
      if (mode === "selfie") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") return;
      }
      // Gallery path uses the system Photo Picker — no media-library permission required.
      const res =
        mode === "selfie"
          ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.6,
              base64: true,
            });
      if (!res.canceled) {
        const a = res.assets[0];
        setter(a?.base64 ? `data:image/jpeg;base64,${a.base64}` : (a?.uri ?? ""));
      }
    } catch {}
  };

  const canNext = (): boolean => {
    if (step === 0) return !!fullName && !!phone && !!email;
    if (step === 1) return !!state;
    if (step === 2) return areas.length > 0 && specs.length > 0;
    return true;
  };

  const next = () => {
    if (!canNext()) return;
    Haptics.selectionAsync().catch(() => {});
    if (step < 3) setStep(((step + 1) as Step));
  };
  const back = () => {
    if (step === 0) router.back();
    else setStep(((step - 1) as Step));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const agent = await api.agentApply({
        full_name: fullName,
        phone,
        email,
        nin: nin || undefined,
        id_document_url: idDoc,
        selfie_url: selfie,
        agency_name: agencyName || undefined,
        cac_number: cacNumber || undefined,
        office_address: officeAddress || undefined,
        state,
        lga: lga || undefined,
        years_experience: parseInt(years, 10) || 0,
        areas_of_operation: areas,
        specialisations: specs,
        has_mandate_authority: hasMandateAuthority,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setExisting(agent);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <Screen testID="become-agent-loading">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Become an agent" />
        <View style={{ padding: spacing.xl, gap: 14 }}>
          <Skeleton height={120} radius={radius.lg} />
          <Skeleton height={20} width="55%" />
          <Skeleton height={14} width="80%" />
          <Skeleton height={200} radius={radius.lg} style={{ marginTop: 8 }} />
        </View>
      </Screen>
    );
  }

  // Already applied → show status card
  if (existing) {
    const badgeColor =
      existing.verification_level >= 3
        ? "#0369A1"
        : existing.verification_level === 2
          ? colors.emerald
          : colors.textTertiary;

    const STATUS_META: Record<
      string,
      { label: string; color: string; icon: string; msg: string }
    > = {
      pending: {
        label: "Pending review",
        color: colors.gold,
        icon: "time",
        msg: "Your application is in the queue. AMASS usually reviews within 1–2 business days — we'll notify you the moment there's an update.",
      },
      approved: {
        label: "Approved",
        color: colors.emerald,
        icon: "checkmark-circle",
        msg: "You're verified! You can now list properties and access the full agent toolkit.",
      },
      rejected: {
        label: "Changes needed",
        color: colors.red,
        icon: "alert-circle",
        msg:
          existing.rejection_reason ||
          "A few details need updating before we can approve your application. Tap below to update and resubmit.",
      },
      suspended: {
        label: "Suspended",
        color: colors.red,
        icon: "pause-circle",
        msg: "Your agent account is currently paused. Please contact AMASS support to restore access.",
      },
    };
    const meta = STATUS_META[existing.status] ?? STATUS_META.pending;
    const stepState =
      existing.status === "approved"
        ? 3
        : existing.status === "rejected" || existing.status === "suspended"
          ? 1
          : 2;

    return (
      <Screen testID="become-agent-status">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Your agent status" subtitle={meta.label} />

        <ScrollView contentContainerStyle={styles.statusWrap} showsVerticalScrollIndicator={false}>
          <View style={[styles.statusIcon, { backgroundColor: badgeColor }]}>
            <Ionicons name="ribbon" size={40} color="#fff" />
          </View>
          <Text style={styles.statusTitle}>{existing.verification_badge}</Text>

          {/* Plain-language status banner */}
          <View style={[styles.statusBanner, { backgroundColor: meta.color + "1A", borderColor: meta.color }]} testID="application-status-banner">
            <View style={styles.statusBannerTop}>
              <Ionicons name={meta.icon as any} size={18} color={meta.color} />
              <Text style={[styles.statusBannerLabel, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <Text style={styles.statusBannerMsg}>{meta.msg}</Text>
          </View>

          {/* Review progress tracker */}
          <View style={styles.tracker}>
            <TrackerStep n={1} label="Submitted" done={stepState >= 1} active={stepState === 1} />
            <View style={[styles.trackerBar, stepState >= 2 && { backgroundColor: colors.emerald }]} />
            <TrackerStep
              n={2}
              label={existing.status === "rejected" ? "Needs update" : "Under review"}
              done={stepState >= 2}
              active={stepState === 2}
              warn={existing.status === "rejected" || existing.status === "suspended"}
            />
            <View style={[styles.trackerBar, stepState >= 3 && { backgroundColor: colors.emerald }]} />
            <TrackerStep n={3} label="Approved" done={stepState >= 3} active={stepState === 3} />
          </View>

          <View style={[styles.card, shadows.soft]}>
            <StatRow label="Full name" value={existing.full_name} />
            <StatRow label="Agency" value={existing.agency_name || "—"} />
            <StatRow label="State" value={`${existing.state}${existing.lga ? ` · ${existing.lga}` : ""}`} />
            <StatRow label="Experience" value={`${existing.years_experience} years`} />
            <StatRow label="Areas" value={existing.areas_of_operation.join(", ") || "—"} />
            <StatRow label="Specialisation" value={existing.specialisations.join(", ") || "—"} />
            <StatRow label="Mandate rate" value={`${Math.round(existing.mandate_verification_rate * 100)}%`} />
          </View>

          <View style={styles.levelsCard}>
            <LevelRow n={1} active={existing.verification_level >= 1} label="Registered Agent" caption="Basic registration complete" />
            <LevelRow n={2} active={existing.verification_level >= 2} label="Identity Verified" caption="Gov ID + selfie match" />
            <LevelRow n={3} active={existing.verification_level >= 3} label="Verified Mandated Agent" caption="Reviewed & approved by AMASS" />
          </View>

          <View style={{ gap: 10, alignSelf: "stretch" }}>
            {existing.status === "approved" ? (
              <Button label="List a property" iconLeft="add-circle" variant="brand" size="lg" fullWidth onPress={() => router.push("/agent/onboarding" as any)} testID="start-onboarding-btn" />
            ) : (
              <Button
                label={existing.status === "rejected" ? "Update & resubmit" : "Edit application"}
                iconLeft="create-outline"
                variant={existing.status === "rejected" ? "brand" : "primary"}
                size="lg"
                fullWidth
                onPress={editApplication}
                testID="edit-application-btn"
              />
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="My representations" iconLeft="ribbon-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push("/agent/representations" as any)} testID="my-reps-btn" />
              <Button label="Plans & upgrade" iconLeft="pricetags-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push("/agent-plans")} testID="see-plans-btn" />
            </View>
            {existing.status === "approved" ? (
              <Button label="Edit application" iconLeft="create-outline" variant="ghost" fullWidth onPress={editApplication} testID="edit-application-btn" />
            ) : (
              <Button label="List a property" iconLeft="add-circle-outline" variant="ghost" fullWidth onPress={() => router.push("/agent/onboarding" as any)} testID="start-onboarding-btn" />
            )}
            <Button label="View my public profile" iconLeft="globe-outline" variant="ghost" fullWidth onPress={() => router.push(`/agent/${existing.user_id}` as any)} testID="view-public-profile-btn" />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen testID="become-agent-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Become an agent" subtitle={`Step ${step + 1} of 4`} onBack={back} backTestID="ba-back" />
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: 4 }}>
        <ProgressBar value={(step + 1) / 4} tone="brand" height={4} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        {step === 0 && (
          <View style={{ gap: spacing.md }}>
            <View style={{ alignItems: "center", marginBottom: spacing.xs }}>
              <AmassLogo size="md" showWordmark={false} />
            </View>
            <Text style={styles.h1}>Personal information</Text>
            <Text style={styles.sub}>We use this to verify your identity and build your public profile.</Text>
            <Field label="Full name" value={fullName} onChangeText={setFullName} testID="ba-name" />
            <View style={styles.row2}>
              <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="ba-phone" style={{ flex: 1 }} />
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" testID="ba-email" style={{ flex: 1 }} />
            </View>
            <Field label="NIN (optional)" value={nin} onChangeText={setNin} keyboardType="numeric" testID="ba-nin" />

            <Text style={styles.subheader}>Verification photos (optional now — required for Level 2)</Text>
            <View style={styles.uploadRow}>
              <UploadCard label="Government ID" uri={idDoc} onPick={() => pickPhoto(setIdDoc, "id")} testID="ba-id" />
              <UploadCard label="Selfie" uri={selfie} onPick={() => pickPhoto(setSelfie, "selfie")} testID="ba-selfie" />
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.h1}>Business information</Text>
            <Text style={styles.sub}>Optional if you&apos;re an independent agent.</Text>
            <Field label="Agency name" value={agencyName} onChangeText={setAgencyName} placeholder="e.g. Amass Realty" testID="ba-agency" />
            <View style={styles.row2}>
              <Field label="CAC number" value={cacNumber} onChangeText={setCacNumber} placeholder="RC123456" testID="ba-cac" style={{ flex: 1 }} />
              <Field label="Years of experience" value={years} onChangeText={setYears} keyboardType="numeric" testID="ba-years" style={{ flex: 1 }} />
            </View>
            <Field label="Office address" value={officeAddress} onChangeText={setOfficeAddress} placeholder="Street, city" testID="ba-office" />

            <Text style={styles.subheader}>State of operation</Text>
            <View style={styles.chipWrap}>
              {NIGERIAN_STATES.map((s) => {
                const on = state === s;
                return (
                  <Pressable key={s} onPress={() => setStateVal(s)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={s} style={[styles.chip, on && styles.chipOn]} testID={`ba-state-${s}`}>
                    <Text style={[styles.chipText, on && { color: "#fff" }]}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Field label="LGA (optional)" value={lga} onChangeText={setLga} testID="ba-lga" />
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.h1}>Coverage & specialisation</Text>
            <Text style={styles.sub}>Where do you work and what do you sell?</Text>

            <Text style={styles.subheader}>Areas of operation ({areas.length})</Text>
            <View style={styles.chipWrap}>
              {AREAS.map((a) => {
                const on = areas.includes(a);
                return (
                  <Pressable
                    key={a}
                    onPress={() => toggle(areas, a, setAreas)}
                    style={[styles.chip, on && styles.chipOn]}
                    testID={`ba-area-${a.replace(/\s+/g, "-")}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: areas.includes(a) }}
                    accessibilityLabel={a}
                  >
                    {on && <Ionicons name="checkmark" size={13} color="#fff" />}
                    <Text style={[styles.chipText, on && { color: "#fff" }]}>{a}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.subheader}>Specialisation ({specs.length})</Text>
            <View style={styles.chipWrap}>
              {SPECIALISATIONS.map((s) => {
                const on = specs.includes(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => toggle(specs, s, setSpecs)}
                    style={[styles.chip, on && styles.chipOn]}
                    testID={`ba-spec-${s.replace(/\s+/g, "-")}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: specs.includes(s) }}
                    accessibilityLabel={s}
                  >
                    {on && <Ionicons name="checkmark" size={13} color="#fff" />}
                    <Text style={[styles.chipText, on && { color: "#fff" }]}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.h1}>Mandate & review</Text>
            <Text style={styles.sub}>
              AMASS distinguishes agents who are officially authorised to market a property.
            </Text>

            <View style={[styles.mandateBox, shadows.soft]}>
              <Text style={styles.mandateQ}>
                Do you have a written or verbal mandate from at least one property owner to market a property?
              </Text>
              <View style={styles.mandateOpts}>
                <Pressable
                  onPress={() => setHasMandateAuthority(true)}
                  style={[styles.mandateOpt, hasMandateAuthority && styles.mandateOptOn]}
                  testID="ba-mandate-yes"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: hasMandateAuthority }}
                >
                  <Ionicons name="checkmark-circle" size={20} color={hasMandateAuthority ? "#fff" : colors.emerald} />
                  <Text style={[styles.mandateOptText, hasMandateAuthority && { color: "#fff" }]}>Yes</Text>
                </Pressable>
                <Pressable
                  onPress={() => setHasMandateAuthority(false)}
                  style={[styles.mandateOpt, !hasMandateAuthority && styles.mandateOptNo]}
                  testID="ba-mandate-no"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: !hasMandateAuthority }}
                >
                  <Ionicons name="close-circle" size={20} color={!hasMandateAuthority ? "#fff" : colors.textTertiary} />
                  <Text style={[styles.mandateOptText, !hasMandateAuthority && { color: "#fff" }]}>No</Text>
                </Pressable>
              </View>
              <Text style={styles.mandateHint}>
                Each specific mandate is captured when you list an individual property. AMASS admin reviews and grants the Verified Mandated Agent badge.
              </Text>
            </View>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Application summary</Text>
              <StatRow label="Name" value={fullName} />
              <StatRow label="State" value={state} />
              <StatRow label="Experience" value={`${years} yrs`} />
              <StatRow label="Areas" value={areas.length > 0 ? areas.join(", ") : "—"} />
              <StatRow label="Specialisation" value={specs.length > 0 ? specs.join(", ") : "—"} />
              <StatRow label="Docs uploaded" value={`${idDoc ? "ID ✓" : "ID —"}  ·  ${selfie ? "Selfie ✓" : "Selfie —"}`} />
            </View>

            <View style={styles.notice}>
              <Ionicons name="shield-checkmark" size={16} color={colors.red} />
              <Text style={styles.noticeText}>
                Your application will be reviewed by AMASS. Level 3 (Verified Mandated Agent) is granted after admin approval of your first mandate.
              </Text>
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: tc.bgElevated, borderTopColor: tc.border }]}>
        <Button
          label={step === 3 ? "Submit application" : "Continue"}
          iconRight={step === 3 ? "paper-plane" : "arrow-forward"}
          variant={step === 3 ? "brand" : "primary"}
          size="lg"
          fullWidth
          loading={submitting}
          disabled={!canNext()}
          onPress={step === 3 ? submit : next}
          testID="ba-next"
        />
      </View>
    </Screen>
  );
}

function Field({
  label,
  style,
  testID,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string; testID?: string; style?: any }) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        testID={testID}
      />
    </View>
  );
}

function UploadCard({
  label,
  uri,
  onPick,
  testID,
}: {
  label: string;
  uri?: string;
  onPick: () => void;
  testID?: string;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable onPress={onPick} style={[styles.uploadCard, uri && { padding: 0 }]} testID={testID} accessibilityRole="button" accessibilityLabel={uri ? "Replace uploaded document" : "Upload document"}>
      {uri ? (
        <Image source={{ uri }} style={styles.uploadImg} contentFit="cover" />
      ) : (
        <>
          <Ionicons name="cloud-upload-outline" size={22} color={colors.textSecondary} />
          <Text style={styles.uploadLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.statValue}>{value}</Text>
    </View>
  );
}

function LevelRow({ n, active, label, caption }: { n: number; active: boolean; label: string; caption: string }) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.lvlRow}>
      <View style={[styles.lvlN, active && styles.lvlNOn]}>
        <Text style={[styles.lvlNText, active && { color: "#fff" }]}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.lvlLabel}>{label}</Text>
        <Text style={styles.lvlCaption}>{caption}</Text>
      </View>
      {active && <Ionicons name="checkmark-circle" size={18} color={colors.emerald} />}
    </View>
  );
}

function TrackerStep({
  n,
  label,
  done,
  active,
  warn,
}: {
  n: number;
  label: string;
  done: boolean;
  active?: boolean;
  warn?: boolean;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const bg = warn && active ? colors.red : done ? colors.emerald : colors.surfaceSecondary;
  const fg = done || (warn && active) ? "#fff" : colors.textTertiary;
  return (
    <View style={styles.trackerStep}>
      <View style={[styles.trackerDot, { backgroundColor: bg }]}>
        {done && !warn ? (
          <Ionicons name="checkmark" size={14} color="#fff" />
        ) : warn && active ? (
          <Ionicons name="alert" size={14} color="#fff" />
        ) : (
          <Text style={[styles.trackerN, { color: fg }]}>{n}</Text>
        )}
      </View>
      <Text style={[styles.trackerLabel, active && { color: colors.text, fontWeight: "800" }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { ...typography.display, fontSize: 26 },
  sub: { ...typography.body, color: colors.textTertiary, lineHeight: 21 },
  subheader: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 6 },
  row2: { flexDirection: "row", gap: 10 },
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
  uploadRow: { flexDirection: "row", gap: 10 },
  uploadCard: {
    flex: 1,
    aspectRatio: 1.3,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 10,
    overflow: "hidden",
  },
  uploadImg: { width: "100%", height: "100%" },
  uploadLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "700" },
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
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  mandateBox: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, gap: 12 },
  mandateQ: { fontSize: 14, fontWeight: "700", color: colors.text, lineHeight: 20 },
  mandateOpts: { flexDirection: "row", gap: 10 },
  mandateOpt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  mandateOptOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  mandateOptNo: { backgroundColor: colors.textTertiary, borderColor: colors.textTertiary },
  mandateOptText: { fontSize: 14, fontWeight: "800", color: colors.text },
  mandateHint: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  summaryBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    gap: 4,
  },
  summaryTitle: { fontSize: 13, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4, marginBottom: 6 },
  statRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
  statLabel: { fontSize: 12, color: colors.textTertiary, fontWeight: "600" },
  statValue: { fontSize: 13, color: colors.text, fontWeight: "700", flex: 1, textAlign: "right" },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.redSurface,
    borderRadius: radius.md,
  },
  noticeText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 17 },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Status view
  statusWrap: { padding: spacing.xl, gap: spacing.md, alignItems: "center", paddingBottom: spacing.xxl },
  statusBanner: {
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: 6,
  },
  statusBannerTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusBannerLabel: { fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  statusBannerMsg: { ...typography.body, color: colors.textSecondary, lineHeight: 20, fontSize: 13 },
  tracker: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  trackerStep: { alignItems: "center", gap: 6, width: 86 },
  trackerDot: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
  },
  trackerN: { fontSize: 13, fontWeight: "800" },
  trackerLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "600", textAlign: "center" },
  trackerBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surfaceSecondary, marginBottom: 20 },
  statusIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  statusTitle: { ...typography.h1, fontSize: 24, marginTop: 8, textAlign: "center" },
  statusSub: { ...typography.body, color: colors.textTertiary, textAlign: "center" },
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, width: "100%", gap: 2, marginTop: spacing.md },
  levelsCard: { width: "100%", gap: 10, marginTop: spacing.md },
  lvlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  lvlN: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  lvlNOn: { backgroundColor: colors.ink },
  lvlNText: { fontSize: 14, fontWeight: "800", color: colors.textTertiary },
  lvlLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  lvlCaption: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
});
