import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";
import { TokenIcon } from "@/src/components/TokenIcon";

type Task = {
  id: string;
  label: string;
  tokens: number;
  icon: any;
  one_time: boolean;
  completed: boolean;
  claimable_today: boolean;
};

export default function EarnScreen() {
  const router = useRouter();
  const { wallet, refresh } = useWallet();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [referral, setReferral] = useState<{
    code: string;
    share_url: string;
    referred_count: number;
    tokens_per_referral: number;
  } | null>(null);
  const [claimBusy, setClaimBusy] = useState<string | null>(null);
  const [phoneModal, setPhoneModal] = useState(false);
  const [referralModal, setReferralModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tasksRes, refRes] = await Promise.all([api.earnTasks(), api.myReferral()]);
      setTasks(tasksRes.tasks);
      setStreak(tasksRes.streak);
      setReferral(refRes);
    } catch {}
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  const handleTask = async (task: Task) => {
    if (task.completed && task.one_time) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Dispatch by task id
    switch (task.id) {
      case "daily_login": {
        setClaimBusy(task.id);
        try {
          const r = await api.claimTask("daily_login");
          if (r.ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          } else {
            Alert.alert("Already claimed", "Come back tomorrow for another bonus.");
          }
          await load();
          await refresh();
        } finally {
          setClaimBusy(null);
        }
        return;
      }
      case "share_listing": {
        setClaimBusy(task.id);
        try {
          const r = await api.claimTask("share_listing");
          if (r.ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          else if (r.reason === "daily_limit_reached") Alert.alert("Limit reached", "You've claimed the maximum 3 share bonuses today.");
          await load();
          await refresh();
        } finally {
          setClaimBusy(null);
        }
        return;
      }
      case "phone_verify":
        setPhoneModal(true);
        return;
      case "complete_profile":
        router.push("/settings");
        return;
      case "identity_verify":
        Alert.alert("Coming soon", "Identity verification will be available in the next release.");
        return;
      case "upload_property":
        router.push("/submit-property");
        return;
      case "refer_friend":
        setReferralModal(true);
        return;
      case "first_review":
        Alert.alert("Coming soon", "Property reviews will unlock after your first inspection.");
        return;
      default:
        return;
    }
  };

  const shareReferral = async () => {
    if (!referral) return;
    Haptics.selectionAsync().catch(() => {});
    await Share.share({
      message: `Join me on AMASS — Africa's #1 property intelligence platform. Use my code ${referral.code} and get 10 bonus tokens.\n${referral.share_url}`,
      url: referral.share_url,
    });
  };

  const balance = wallet?.spendable ?? 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Earn Tokens</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* Streak / Balance hero */}
        <LinearGradient
          colors={["#0A0A0A", "#1F1F1F"]}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Your token balance</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={styles.heroValue}>{balance.toLocaleString()}</Text>
                <Text style={styles.heroUnit}>tokens</Text>
              </View>
            </View>
            <View style={styles.heroCoin}>
              <TokenIcon size={64} animated />
            </View>
          </View>
          <View style={styles.streakBar}>
            <Ionicons name="flame" size={16} color="#F5B301" />
            <Text style={styles.streakText}>
              {streak > 0 ? `${streak}-day streak!` : "Start a daily-login streak"}
            </Text>
            {streak >= 3 && (
              <View style={styles.streakChip}>
                <Text style={styles.streakChipText}>🔥 {streak}</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* Referral card */}
        {referral && (
          <View style={[styles.referralCard, shadows.card]}>
            <View style={styles.referralHeader}>
              <View style={styles.referralIcon}>
                <Ionicons name="people" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.referralTitle}>Refer a friend</Text>
                <Text style={styles.referralBody}>
                  You earn {referral.tokens_per_referral} tokens · they get 10 bonus
                </Text>
              </View>
            </View>
            <View style={styles.referralCodeRow}>
              <View style={styles.referralCode}>
                <Text style={styles.referralCodeText}>{referral.code}</Text>
              </View>
              <Pressable onPress={shareReferral} style={styles.referralShareBtn} testID="referral-share">
                <Ionicons name="share-social" size={16} color="#fff" />
                <Text style={styles.referralShareText}>Share</Text>
              </Pressable>
            </View>
            {referral.referred_count > 0 && (
              <Text style={styles.referralStat}>
                🎉 {referral.referred_count} friend{referral.referred_count > 1 ? "s" : ""} joined
              </Text>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Complete tasks · earn tokens</Text>
        {loading ? (
          <ActivityIndicator color={colors.red} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.tasksList}>
            {tasks.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => handleTask(t)}
                disabled={t.completed && t.one_time}
                style={[
                  styles.taskRow,
                  t.completed && t.one_time && styles.taskRowDone,
                ]}
                testID={`task-${t.id}`}
              >
                <View
                  style={[
                    styles.taskIcon,
                    { backgroundColor: t.completed && t.one_time ? "#059669" + "18" : "#FFF7DB" },
                  ]}
                >
                  <Ionicons
                    name={t.completed && t.one_time ? "checkmark-circle" : t.icon}
                    size={22}
                    color={t.completed && t.one_time ? "#059669" : "#B27A00"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskLabel}>{t.label}</Text>
                  <View style={styles.taskMeta}>
                    <TokenIcon size={11} />
                    <Text style={styles.taskReward}>+{t.tokens} tokens</Text>
                    {!t.one_time && (
                      <>
                        <Text style={styles.taskDot}>·</Text>
                        <Text style={styles.taskRepeat}>Repeatable</Text>
                      </>
                    )}
                  </View>
                </View>
                {t.completed && t.one_time ? (
                  <View style={styles.taskDoneBadge}>
                    <Text style={styles.taskDoneText}>Done</Text>
                  </View>
                ) : claimBusy === t.id ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <View style={styles.taskCta}>
                    <Ionicons name="chevron-forward" size={16} color={colors.text} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <PhoneVerifyModal
        visible={phoneModal}
        onClose={() => {
          setPhoneModal(false);
          load();
          refresh();
        }}
      />
      <ReferralApplyModal
        visible={referralModal}
        onClose={() => {
          setReferralModal(false);
          load();
          refresh();
        }}
      />
    </View>
  );
}

function PhoneVerifyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("+234");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStep("phone");
      setPhone("+234");
      setCode("");
      setError(null);
      setHint(null);
    }
  }, [visible]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.phoneVerifyStart(phone);
      setHint(r.hint ?? null);
      setStep("code");
    } catch (e: any) {
      setError(e?.message ?? "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.phoneVerifyConfirm(phone, code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Phone verified!", "You've earned 5 tokens.", [{ text: "Great", onPress: onClose }]);
    } catch (e: any) {
      setError(e?.message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Verify your phone</Text>
          <Text style={styles.modalSub}>
            {step === "phone"
              ? "We'll send you a 6-digit code to confirm your number."
              : `Enter the 6-digit code sent to ${phone}.`}
          </Text>

          {step === "phone" ? (
            <>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+234 800 000 0000"
                placeholderTextColor={colors.textMuted}
                style={styles.modalInput}
                testID="phone-input"
              />
              {error && <Text style={styles.modalError}>{error}</Text>}
              <Pressable
                onPress={send}
                style={[styles.modalBtn, busy && { opacity: 0.6 }]}
                disabled={busy || phone.length < 8}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnText}>Send code</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                placeholder="123456"
                maxLength={6}
                placeholderTextColor={colors.textMuted}
                style={[styles.modalInput, { fontSize: 26, letterSpacing: 12, textAlign: "center" }]}
                testID="otp-input"
              />
              {hint && (
                <View style={styles.hintBox}>
                  <Ionicons name="information-circle" size={12} color={colors.textTertiary} />
                  <Text style={styles.hintText}>{hint}</Text>
                </View>
              )}
              {error && <Text style={styles.modalError}>{error}</Text>}
              <Pressable
                onPress={confirm}
                style={[styles.modalBtn, busy && { opacity: 0.6 }]}
                disabled={busy || code.length !== 6}
                testID="confirm-otp"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnText}>Verify & Earn 5 tokens</Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReferralApplyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCode("");
      setError(null);
    }
  }, [visible]);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.applyReferral(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Referral applied!", `You got ${r.you_get} bonus tokens.`, [
        { text: "Yay!", onPress: onClose },
      ]);
    } catch (e: any) {
      setError(e?.message ?? "Could not apply code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Have a referral code?</Text>
          <Text style={styles.modalSub}>
            Enter a friend&apos;s code to earn 10 bonus tokens. They earn 50.
          </Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            placeholder="ADA-X4K2"
            placeholderTextColor={colors.textMuted}
            style={[styles.modalInput, { fontSize: 20, letterSpacing: 4, textAlign: "center" }]}
            testID="referral-input"
          />
          {error && <Text style={styles.modalError}>{error}</Text>}
          <Pressable
            onPress={apply}
            style={[styles.modalBtn, busy && { opacity: 0.6 }]}
            disabled={busy || code.length < 6}
            testID="apply-referral-btn"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalBtnText}>Apply code · Earn 10 tokens</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroTop: { flexDirection: "row", alignItems: "center" },
  heroLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  heroValue: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1.5,
    marginTop: 4,
  },
  heroUnit: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: "700" },
  heroCoin: { position: "absolute", right: 0, top: 0 },
  streakBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  streakText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  streakChip: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(245,179,1,0.2)",
    borderWidth: 1,
    borderColor: "#F5B301",
  },
  streakChipText: { color: "#F5B301", fontWeight: "900", fontSize: 12 },
  referralCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 12,
  },
  referralHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  referralIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  referralTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  referralBody: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  referralCodeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  referralCode: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FAFAFA",
  },
  referralCodeText: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 3,
  },
  referralShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  referralShareText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  referralStat: { fontSize: 12, color: "#059669", fontWeight: "700" },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  tasksList: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  taskRowDone: { opacity: 0.6 },
  taskIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  taskLabel: { fontSize: 14, fontWeight: "800", color: colors.text },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  taskReward: { fontSize: 11, fontWeight: "800", color: "#B27A00" },
  taskDot: { fontSize: 12, color: colors.textTertiary },
  taskRepeat: { fontSize: 11, color: colors.textTertiary, fontWeight: "700" },
  taskCta: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  taskDoneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#059669",
  },
  taskDoneText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: 6,
  },
  modalTitle: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  modalSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    backgroundColor: "#fff",
  },
  modalBtn: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  modalError: { color: colors.red, fontSize: 12, fontWeight: "700" },
  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  hintText: { flex: 1, fontSize: 11, color: colors.textSecondary },
});
