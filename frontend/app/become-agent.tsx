import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { api, AgentPublic } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      </SafeAreaView>
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
    return (
      <SafeAreaView style={styles.container} edges={["top"]} testID="become-agent-status">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.hdr}>Your agent status</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.statusWrap}>
          <View style={[styles.statusIcon, { backgroundColor: badgeColor }]}>
            <Ionicons name="ribbon" size={40} color="#fff" />
          </View>
          <Text style={styles.statusTitle}>{existing.verification_badge}</Text>
          <Text style={styles.statusSub}>
            Application {existing.status.toUpperCase()} · Level {existing.verification_level} of 3
          </Text>

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

          <Pressable
            style={styles.editBtn}
            onPress={() => setExisting(null)}
            testID="edit-application-btn"
          >
            <Ionicons name="create-outline" size={16} color={colors.text} />
            <Text style={styles.editBtnText}>Edit application</Text>
          </Pressable>

          <Pressable
            style={styles.plansBtn}
            onPress={() => router.push("/agent/onboarding" as any)}
            testID="start-onboarding-btn"
          >
            <Ionicons name="add-circle" size={16} color={colors.bg} />
            <Text style={styles.plansBtnText}>List a property (new wizard)</Text>
          </Pressable>

          <Pressable
            style={styles.publicBtn}
            onPress={() => router.push("/agent/representations" as any)}
            testID="my-reps-btn"
          >
            <Ionicons name="ribbon-outline" size={16} color={colors.ink} />
            <Text style={styles.publicBtnText}>My representations</Text>
          </Pressable>

          <Pressable
            style={styles.editBtn}
            onPress={() => router.push("/agent-plans")}
            testID="see-plans-btn"
          >
            <Ionicons name="pricetags" size={16} color={colors.text} />
            <Text style={styles.editBtnText}>See plans & upgrade</Text>
          </Pressable>

          <Pressable
            style={styles.publicBtn}
            onPress={() => router.push(`/agent/${existing.user_id}` as any)}
            testID="view-public-profile-btn"
          >
            <Ionicons name="globe-outline" size={16} color={colors.ink} />
            <Text style={styles.publicBtnText}>View my public profile</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="become-agent-screen">
      <View style={styles.header}>
        <Pressable onPress={back} style={styles.iconBtn} testID="ba-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.stepLbl}>Step {step + 1} of 4</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((step + 1) / 4) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        {step === 0 && (
          <View style={{ gap: spacing.md }}>
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
            <Text style={styles.sub}>Optional if you're an independent agent.</Text>
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
                  <Pressable key={s} onPress={() => setStateVal(s)} style={[styles.chip, on && styles.chipOn]} testID={`ba-state-${s}`}>
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
                >
                  <Ionicons name="checkmark-circle" size={20} color={hasMandateAuthority ? "#fff" : colors.emerald} />
                  <Text style={[styles.mandateOptText, hasMandateAuthority && { color: "#fff" }]}>Yes</Text>
                </Pressable>
                <Pressable
                  onPress={() => setHasMandateAuthority(false)}
                  style={[styles.mandateOpt, !hasMandateAuthority && styles.mandateOptNo]}
                  testID="ba-mandate-no"
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

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          onPress={step === 3 ? submit : next}
          disabled={!canNext() || submitting}
          style={[styles.cta, (!canNext() || submitting) && { opacity: 0.4 }]}
          testID="ba-next"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>{step === 3 ? "Submit application" : "Continue"}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Field({
  label,
  style,
  testID,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string; testID?: string; style?: any }) {
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
  return (
    <Pressable onPress={onPick} style={[styles.uploadCard, uri && { padding: 0 }]} testID={testID}>
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
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.statValue}>{value}</Text>
    </View>
  );
}

function LevelRow({ n, active, label, caption }: { n: number; active: boolean; label: string; caption: string }) {
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
  hdr: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 18 },
  stepLbl: { fontSize: 12, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.4 },
  progressBar: { marginTop: 6, width: "80%", height: 4, borderRadius: 2, backgroundColor: colors.surfaceSecondary, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.red, borderRadius: 2 },
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
  mandateBox: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", gap: 12 },
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
    backgroundColor: "#fff",
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
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  // Status view
  statusWrap: { padding: spacing.xl, gap: spacing.md, alignItems: "center" },
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
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", width: "100%", gap: 2, marginTop: spacing.md },
  levelsCard: { width: "100%", gap: 10, marginTop: spacing.md },
  lvlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
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
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  editBtnText: { fontSize: 13, fontWeight: "800", color: colors.text },
  plansBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    marginTop: spacing.md,
  },
  plansBtnText: { fontSize: 14, fontWeight: "800", color: colors.bg },
  publicBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.ink,
    marginTop: spacing.sm,
  },
  publicBtnText: { fontSize: 13, fontWeight: "800", color: colors.ink },
});
