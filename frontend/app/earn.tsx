import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Share } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { api } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { motion, radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Section, Sheet, SkeletonRows, useToast, type IconName } from "@/src/ui";
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

const TASK_ICON: Record<string, IconName> = {
  daily_login: "calendar",
  share_listing: "share-social",
  phone_verify: "call",
  complete_profile: "person",
  upload_property: "home",
  refer_friend: "people",
  identity_verify: "shield-checkmark",
  first_review: "star",
};

const TASK_HINT: Record<string, string> = {
  daily_login: "Claim once a day — keep your streak alive.",
  share_listing: "Share any listing with a friend. Up to 3 bonuses a day.",
  phone_verify: "Confirm your number to unlock trusted messaging.",
  complete_profile: "Add your city and a short bio.",
  upload_property: "Publish a listing — credited automatically on approval.",
  refer_friend: "Enter a friend's code, or share yours below.",
};

export default function EarnScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { wallet, refresh } = useWallet();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [referral, setReferral] = useState<{ code: string; share_url: string; referred_count: number; tokens_per_referral: number } | null>(null);
  const [claimBusy, setClaimBusy] = useState<string | null>(null);
  const [phoneModal, setPhoneModal] = useState(false);
  const [referralModal, setReferralModal] = useState(false);
  const [burst, setBurst] = useState<number | null>(null);

  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const burstY = useSharedValue(0);
  const burstO = useSharedValue(0);
  const burstStyle = useAnimatedStyle(() => ({ opacity: burstO.value, transform: [{ translateY: burstY.value }] }));

  const load = useCallback(async () => {
    setError(false);
    try {
      const [tasksRes, refRes] = await Promise.all([api.earnTasks(), api.myReferral()]);
      // Hide not-yet-available stub tasks so nothing looks broken to users.
      const HIDDEN_TASKS = ["identity_verify", "first_review"];
      setTasks(tasksRes.tasks.filter((t) => !HIDDEN_TASKS.includes(t.id)));
      setStreak(tasksRes.streak);
      setReferral(refRes);
    } catch {
      setError(true);
    } finally {
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

  const celebrate = (amount: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBurst(amount);
    pop.value = withSequence(withSpring(1.04, motion.spring), withSpring(1, motion.spring));
    burstY.value = 0;
    burstO.value = 1;
    burstY.value = withTiming(-56, { duration: 900 });
    burstO.value = withTiming(0, { duration: 900 });
    setTimeout(() => setBurst(null), 950);
  };

  const handleTask = async (task: Task) => {
    if (task.completed && task.one_time) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    switch (task.id) {
      case "daily_login": {
        setClaimBusy(task.id);
        try {
          const r = await api.claimTask("daily_login");
          if (r.ok) {
            celebrate(task.tokens);
            toast.success(`+${task.tokens} MASS claimed`, "See you tomorrow to keep the streak going.");
          } else {
            toast.info("Already claimed today", "Come back tomorrow for another bonus.");
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
          if (r.ok) {
            celebrate(task.tokens);
            toast.success(`+${task.tokens} MASS`, "Thanks for spreading the word.");
          } else if (r.reason === "daily_limit_reached") toast.info("Limit reached", "You've claimed the maximum 3 share bonuses today.");
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
      case "upload_property":
        router.push("/submit-property");
        return;
      case "refer_friend":
        setReferralModal(true);
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

  const copyReferral = async () => {
    if (!referral) return;
    await Clipboard.setStringAsync(referral.code);
    toast.success("Code copied", `${referral.code} is on your clipboard.`);
  };

  const balance = wallet?.spendable ?? 0;
  const daily = tasks.find((t) => t.id === "daily_login");
  const dailyClaimable = daily ? daily.claimable_today && !daily.completed : false;
  const completedCount = tasks.filter((t) => t.completed && t.one_time).length;
  const oneTimeCount = tasks.filter((t) => t.one_time).length;
  const weekDots = Array.from({ length: 7 }, (_, i) => i < Math.min(streak % 7 === 0 && streak > 0 ? 7 : streak % 7, 7));

  return (
    <Screen testID="earn-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Earn tokens" subtitle="Tasks · Referrals · Daily bonus" />
      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: space[5] }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        {/* Streak hero */}
        <Animated.View style={[{ paddingHorizontal: space[4] }, popStyle]}>
          <LinearGradient colors={isDark ? ["#1F1D1A", "#141210"] : ["#1A1816", "#0A0A0A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero} testID="earn-hero">
            <View style={styles.heroCoin}>
              <TokenIcon size={130} animated />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" color="rgba(255,255,255,0.6)" uppercase>
                  Your MASS balance
                </AppText>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <AnimatedNumber value={balance} variant="heroLg" color="#fff" testID="earn-balance" />
                  <AppText variant="title" color={colors.mass}>
                    MASS
                  </AppText>
                </View>
              </View>
              {burst != null ? (
                <Animated.View style={[styles.burst, burstStyle]} pointerEvents="none">
                  <AppText variant="h3" color={colors.mass} tabular>
                    +{burst}
                  </AppText>
                </Animated.View>
              ) : null}
            </View>

            <View style={styles.streakRow}>
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="flame" size={16} color={colors.mass} />
                  <AppText variant="title" color="#fff">
                    {streak > 0 ? `${streak}-day streak` : "Start your streak"}
                  </AppText>
                </View>
                <View style={styles.dots} accessibilityLabel={`${streak} day streak`}>
                  {weekDots.map((on, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: on ? colors.mass : "rgba(255,255,255,0.14)", borderColor: on ? colors.mass : "rgba(255,255,255,0.25)" }]}>
                      {on ? <Ionicons name="checkmark" size={10} color="#1A1200" /> : null}
                    </View>
                  ))}
                </View>
              </View>
              {daily ? (
                <Button
                  label={dailyClaimable ? `Claim +${daily.tokens}` : "Claimed"}
                  variant="mass"
                  size="md"
                  iconLeft={dailyClaimable ? "gift" : "checkmark-circle"}
                  disabled={!dailyClaimable}
                  loading={claimBusy === "daily_login"}
                  onPress={() => handleTask(daily)}
                  testID="daily-claim"
                />
              ) : null}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Referral */}
        {referral ? (
          <Section title="Refer a friend" caption={`You earn ${referral.tokens_per_referral} MASS per friend · they get 10 bonus`}>
            <Card testID="referral-card">
              <View style={{ gap: 14 }}>
                <View style={styles.codeRow}>
                  <View style={[styles.code, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <AppText variant="label" tone="tertiary" uppercase>
                      Your code
                    </AppText>
                    <AppText variant="h2" tabular style={{ letterSpacing: 2 }} testID="referral-code">
                      {referral.code}
                    </AppText>
                  </View>
                  <View style={{ gap: 8 }}>
                    <Button label="Copy" variant="secondary" size="sm" iconLeft="copy-outline" onPress={copyReferral} testID="referral-copy" />
                    <Button label="Share" size="sm" iconLeft="share-social" onPress={shareReferral} testID="referral-share" />
                  </View>
                </View>
                <View style={[styles.earnRow, { borderTopColor: colors.divider }]}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3" tabular>
                      {referral.referred_count}
                    </AppText>
                    <AppText variant="caption" tone="tertiary">
                      Friends joined
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3" tabular tone="mass">
                      +{(referral.referred_count * referral.tokens_per_referral).toLocaleString()}
                    </AppText>
                    <AppText variant="caption" tone="tertiary">
                      MASS earned from referrals
                    </AppText>
                  </View>
                  <Pressable onPress={() => setReferralModal(true)} hitSlop={8} accessibilityRole="button" testID="referral-have-code">
                    <AppText variant="caption" weight="bold" color={colors.text}>
                      Have a code?
                    </AppText>
                  </Pressable>
                </View>
              </View>
            </Card>
          </Section>
        ) : null}

        {/* Tasks */}
        <Section title="Tasks" caption={oneTimeCount ? `${completedCount} of ${oneTimeCount} one-time tasks complete` : "Complete tasks to earn MASS"}>
          {loading ? (
            <Card>
              <SkeletonRows rows={5} />
            </Card>
          ) : error ? (
            <Card padded={false}>
              <EmptyState compact variant="error" title="Couldn't load tasks" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
            </Card>
          ) : (
            <View style={{ gap: space[3] }}>
              {tasks.map((t) => {
                const done = t.completed && t.one_time;
                const busy = claimBusy === t.id;
                return (
                  <Card key={t.id} onPress={done ? undefined : () => handleTask(t)} testID={`task-${t.id}`} style={done ? { opacity: 0.7 } : undefined}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <View style={[styles.taskIcon, { backgroundColor: done ? colors.successSoft : colors.massSoft }]}>
                        <Ionicons name={done ? "checkmark-circle" : (TASK_ICON[t.id] ?? "sparkles")} size={22} color={done ? colors.success : colors.massText} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <AppText variant="title">{t.label}</AppText>
                        <AppText variant="caption" tone="tertiary">
                          {TASK_HINT[t.id] ?? (t.one_time ? "One-time reward" : "Repeatable reward")}
                        </AppText>
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                          <Badge label={`+${t.tokens} MASS`} tone="mass" icon="sparkles" />
                          {!t.one_time ? <Badge label="Repeatable" tone="neutral" icon="repeat" /> : null}
                          {done ? <Badge label="Done" tone="success" icon="checkmark" /> : null}
                        </View>
                      </View>
                      {done ? null : busy ? (
                        <Badge label="Working…" tone="neutral" />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      )}
                    </View>
                    {t.one_time ? (
                      <View style={[styles.progress, { backgroundColor: colors.surfaceSunken }]}>
                        <View style={{ width: done ? "100%" : "0%", height: "100%", backgroundColor: colors.success }} />
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )}
        </Section>
      </ScrollView>

      <PhoneVerifySheet
        visible={phoneModal}
        onClose={() => {
          setPhoneModal(false);
          load();
          refresh();
        }}
      />
      <ReferralApplySheet
        visible={referralModal}
        onClose={() => {
          setReferralModal(false);
          load();
          refresh();
        }}
      />
    </Screen>
  );
}

function PhoneVerifySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const { colors } = useTheme();
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
      toast.success("Phone verified", "You've earned 5 MASS.");
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Verify your phone" testID="phone-verify-sheet">
      <View style={{ gap: 14 }}>
        <AppText variant="bodySm" tone="secondary">
          {step === "phone" ? "We'll send you a 6-digit code to confirm your number." : `Enter the 6-digit code sent to ${phone}.`}
        </AppText>
        {step === "phone" ? (
          <>
            <Input label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+234 800 000 0000" iconLeft="call-outline" error={error} testID="phone-input" autoFocus />
            <Button label="Send code" size="lg" fullWidth loading={busy} disabled={phone.length < 8} onPress={send} testID="send-otp" />
          </>
        ) : (
          <>
            <Input label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" maxLength={6} iconLeft="keypad-outline" error={error} helper={hint ?? undefined} testID="otp-input" autoFocus style={{ letterSpacing: 6, fontSize: 20 }} />
            <Button label="Verify & earn 5 MASS" variant="mass" size="lg" fullWidth loading={busy} disabled={code.length !== 6} onPress={confirm} testID="confirm-otp" />
            <Pressable onPress={() => setStep("phone")} hitSlop={8} style={{ alignSelf: "center", padding: 8 }} accessibilityRole="button">
              <AppText variant="caption" color={colors.textSecondary}>
                Use a different number
              </AppText>
            </Pressable>
          </>
        )}
      </View>
    </Sheet>
  );
}

function ReferralApplySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
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
      toast.success("Referral applied", `You got ${r.you_get} bonus MASS.`);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Could not apply code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Have a referral code?" testID="referral-sheet">
      <View style={{ gap: 14 }}>
        <AppText variant="bodySm" tone="secondary">
          Enter a friend&apos;s code to earn 10 bonus MASS. They earn 50.
        </AppText>
        <Input label="Referral code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" placeholder="ADA-X4K2" iconLeft="ticket-outline" error={error} testID="referral-input" autoFocus style={{ letterSpacing: 3 }} />
        <Button label="Apply code · earn 10 MASS" size="lg" fullWidth loading={busy} disabled={code.length < 6} onPress={apply} testID="apply-referral-btn" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: 20, gap: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  heroCoin: { position: "absolute", right: -30, top: -34, opacity: 0.16 },
  burst: { position: "absolute", right: 8, top: 0 },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 16 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  codeRow: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  code: { flex: 1, padding: 14, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, gap: 4, justifyContent: "center" },
  earnRow: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  taskIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  progress: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 12 },
});
