import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/contexts/auth";
import { useWallet } from "@/src/contexts/wallet";
import { api, type FixaStatus } from "@/src/lib/api";
import { useTheme, useThemeMode } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, Avatar, Badge, Button, ListRow, ProgressBar, RowGroup, Screen, Shimmer, StatTile, type IconName, Gloss } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";

type Row = { icon: IconName; label: string; route: string; requires?: "agent"; tone?: "default" | "brand" | "mass" | "fix" | "success" | "warning" | "info" | "premium" };

// Ordered by product priority (see spec); grouped for scannability. Icon + 1–3 word label only.
/**
 * My AMASS menu — reviewed Jun 2026 (owner-approved reorganisation):
 *   • Wallet & rewards keeps only money things; Home search holds saved homes / searches / viewings.
 *   • "My listings & posts" is for every member (listing a property never requires Agent status) and gained
 *     "My Properties", which was previously unreachable from the menu.
 *   • Agents group = things that need a verified Agent (locked rows show an Agents badge); Agent Plans moved inside
 *     Agent Workspace. "Find a Pro" left the menu — it lives in Market → FIXA.
 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Wallet & rewards",
    rows: [
      { icon: "wallet-outline", label: "Wallet", route: "/wallet", tone: "mass" },
      { icon: "lock-open-outline", label: "My Unlocks", route: "/unlocks" },
      { icon: "gift-outline", label: "Earn Tokens", route: "/earn", tone: "success" },
    ],
  },
  {
    title: "Home search",
    rows: [
      { icon: "heart-outline", label: "Saved Properties", route: "/saved-properties", tone: "brand" },
      { icon: "bookmark-outline", label: "Saved Searches", route: "/saved-searches" },
      { icon: "calendar-outline", label: "Viewings", route: "/viewings", tone: "info" },
    ],
  },
  {
    title: "My listings & posts",
    rows: [
      { icon: "add-circle-outline", label: "List a Property", route: "/submit-property", tone: "brand" },
      { icon: "home-outline", label: "My Properties", route: "/agent-dashboard" },
      { icon: "storefront-outline", label: "My Market Listings", route: "/marketplace/my-listings" },
      { icon: "megaphone-outline", label: "My Ad Campaigns", route: "/ads" },
    ],
  },
  {
    title: "Agents",
    rows: [
      { icon: "ribbon-outline", label: "Become an Agent", route: "/become-agent", tone: "brand" },
      { icon: "briefcase-outline", label: "Agent Workspace", route: "/agent-workspace", requires: "agent" },
      { icon: "time-outline", label: "Viewing Requests & Hours", route: "/viewings?role=agent", requires: "agent", tone: "info" },
      { icon: "people-outline", label: "Agency Team", route: "/agency", requires: "agent", tone: "brand" },
    ],
  },
  {
    title: "FIXA & services",
    rows: [
      { icon: "calendar-outline", label: "My FIXA Bookings", route: "/fixa/bookings" },
      { icon: "construct-outline", label: "Improve My Property", route: "/improve", tone: "info" },
    ],
  },
  {
    title: "Trust & documents",
    rows: [
      { icon: "document-text-outline", label: "My Documents", route: "/my-documents" },
      { icon: "shield-checkmark-outline", label: "Identity Verification", route: "/identity-verification", tone: "success" },
    ],
  },
  {
    title: "Account",
    rows: [
      { icon: "notifications-outline", label: "Notifications", route: "/notifications" },
      { icon: "settings-outline", label: "Settings", route: "/settings" },
      { icon: "help-circle-outline", label: "Help & Support", route: "/help" },
      { icon: "information-circle-outline", label: "About AMASS", route: "/about" },
    ],
  },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { mass } = useWallet();
  const { colors, isDark, shadows } = useTheme();
  const { setMode } = useThemeMode();

  const [saved, setSaved] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState<number | null>(null);
  const [fixaStatus, setFixaStatus] = useState<FixaStatus | "none" | null>(null);
  const [agency, setAgency] = useState<{ name: string | null; invites: number }>({ name: null, invites: 0 });

  useFocusEffect(
    useCallback(() => {
      // listFavorites keeps the count consistent with the Saved Properties screen.
      api.listFavorites().then((r) => setSaved(r.length)).catch(() => setSaved(0));
      // myUnlocks is the same source the Unlocks screen renders, so the tile and the list always agree.
      api.myUnlocks("property").then((r) => setUnlocked(r.count)).catch(() => setUnlocked(0));
      // FIXA: providers (pending or verified) get their dashboard; everyone else is invited to join.
      api.fixaMe().then((m) => setFixaStatus(m.status)).catch(() => setFixaStatus("none"));
      // Agency team: show the agency name, or how many invites are waiting.
      api.agencyMe().then((m) => setAgency({ name: m.agency?.name ?? null, invites: m.my_invites.length })).catch(() => setAgency({ name: null, invites: 0 }));
    }, [])
  );

  const isProvider = !!fixaStatus && fixaStatus !== "none";
  const groups = useMemo(() => {
    const fixaRow: Row = isProvider
      ? { icon: "hammer-outline", label: fixaStatus === "pending" ? "My FIXA Profile · Pending" : "My FIXA Dashboard", route: "/fixa/provider", tone: "fix" }
      : { icon: "hammer-outline", label: "Join FIXA", route: "/fixa/join", tone: "fix" };
    return GROUPS.map((g) => (g.title === "FIXA & services" ? { ...g, rows: [fixaRow, ...g.rows] } : g));
  }, [isProvider, fixaStatus]);

  const memberYear = user?.created_at ? new Date(user.created_at).getFullYear() : new Date().getFullYear();
  const firstName = (user?.full_name || "").trim().split(" ")[0] || "there";

  // Profile completion — steps that unlock trust & features. Tap a step to do it.
  const steps = [
    { key: "photo", label: "Add photo", done: !!user?.avatar_url, icon: "camera-outline" as IconName, route: "/settings" },
    { key: "phone", label: "Verify phone", done: !!user?.phone_verified, icon: "call-outline" as IconName, route: "/(auth)/phone" },
    { key: "save", label: "Save a home", done: (saved ?? 0) > 0, icon: "heart-outline" as IconName, route: "/(tabs)" },
    { key: "id", label: "Verify ID", done: !!user?.identity_verified, icon: "shield-checkmark-outline" as IconName, route: "/identity-verification" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  const doSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Sign out? You'll need to sign in again to continue.")) signOut();
      return;
    }
    Alert.alert("Sign out?", "You'll need to sign in again to continue.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  const toggleTheme = () => {
    Haptics.selectionAsync().catch(() => {});
    setMode(isDark ? "light" : "dark");
  };

  return (
    <Screen testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 140, gap: space[5] }} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <View style={styles.header}>
          <View style={styles.identity}>
            <Avatar name={user?.full_name} uri={user?.avatar_url} size={72} verified={!!user?.identity_verified} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" tone="tertiary" testID="profile-greeting">
                {greeting()} 👋
              </AppText>
              <AppText variant="h2" numberOfLines={1}>
                {firstName}
              </AppText>
              <View style={styles.badges}>
                {user?.is_agent ? <Badge label="Agent" tone="success" icon="briefcase" testID="badge-agent" /> : <Badge label="Member" tone="neutral" icon="person" />}
                {user?.identity_verified ? <Badge label="ID verified" tone="fix" icon="shield-checkmark" testID="badge-identity" /> : null}
                {user?.is_admin ? <Badge label="Admin" tone="brand" icon="key" /> : null}
                {(user as any)?.phone_verified ? <Badge label="Phone" tone="info" icon="call" /> : null}
              </View>
            </View>
            <Pressable
              onPress={toggleTheme}
              accessibilityRole="switch"
              accessibilityState={{ checked: isDark }}
              accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
              testID="theme-toggle"
              hitSlop={8}
              style={[styles.themeBtn, { backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name={isDark ? "sunny" : "moon"} size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Profile completion — progress + one obvious next step */}
        {doneCount < steps.length ? (
          <Pressable
            onPress={() => nextStep && router.push(nextStep.route as any)}
            accessibilityRole="button"
            accessibilityLabel={`Profile ${doneCount} of ${steps.length} complete. Next: ${nextStep?.label}`}
            testID="profile-progress"
            style={({ pressed }) => [styles.progress, { backgroundColor: colors.surface }, shadows.xs, pressed && { opacity: 0.92 }]}
          >
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <AppText variant="title">Profile {Math.round((doneCount / steps.length) * 100)}%</AppText>
                <AppText variant="caption" tone="tertiary" tabular>
                  {doneCount}/{steps.length}
                </AppText>
              </View>
              <ProgressBar value={doneCount / steps.length} tone="brand" height={8} />
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {steps.map((s) => (
                  <View key={s.key} style={[styles.step, { backgroundColor: s.done ? colors.successSoft : colors.surfaceAlt }]}>
                    <Ionicons name={s.done ? "checkmark-circle" : s.icon} size={14} color={s.done ? colors.success : colors.textSecondary} />
                    <AppText variant="micro" color={s.done ? colors.success : colors.textSecondary}>
                      {s.label}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {/* Wallet hero — Top-up button is a sibling of the card pressable (no nested buttons on web) */}
        <View style={styles.walletWrap} testID="wallet-card-wrap">
          <LinearGradient colors={isDark ? ["#292926", "#1C1C1A"] : ["#1C1C1A", "#111111"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wallet}>
            <Gloss height="48%" opacity={0.55} />
            <Shimmer intensity={0.35} delay={900} />
            <View style={styles.walletCoin}>
              <TokenIcon size={120} animated />
            </View>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                router.push("/wallet");
              }}
              accessibilityRole="button"
              accessibilityLabel={`Wallet. ${mass?.spendable ?? 0} MASS. Open wallet`}
              testID="wallet-card"
              style={({ pressed }) => [{ gap: 18 }, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.walletRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label" color="rgba(255,255,255,0.6)" uppercase>
                    MASS balance
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <AnimatedNumber value={mass?.spendable ?? 0} variant="heroLg" color="#fff" testID="profile-mass" />
                    <AppText variant="caption" color={colors.mass}>
                      MASS
                    </AppText>
                  </View>
                </View>
                <View style={{ width: 96 }} />
              </View>
              <View style={styles.walletFooter}>
                <View style={[styles.fixPill, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                  <View style={[styles.coinDot, { backgroundColor: colors.mass }]} />
                  <AppText variant="caption" color="#fff" tabular>
                    1 MASS = ₦100
                  </AppText>
                </View>
                {mass?.subscription?.plan_id ? (
                  <Badge label={`${mass.subscription.plan_id} plan`} tone="premium" icon="star" />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <AppText variant="caption" color="rgba(255,255,255,0.7)">
                      Wallet
                    </AppText>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
                  </View>
                )}
              </View>
            </Pressable>
            <View style={styles.walletTopup}>
              <Button label="Top up" variant="premium" size="sm" iconLeft="add" onPress={() => router.push("/buy-tokens")} testID="profile-topup" />
            </View>
          </LinearGradient>
        </View>

        {/* Stats */}
        <View style={styles.stats}>
          <StatTile icon="heart" tone="brand" value={saved ?? "—"} label="Saved" onPress={() => router.push("/saved-properties")} testID="stat-saved" />
          <StatTile icon="lock-open" tone="default" value={unlocked ?? "—"} label="Unlocked" onPress={() => router.push("/unlocks")} testID="stat-unlocked" />
          <StatTile icon="calendar" tone="mass" value={String(memberYear)} label="Since" />
        </View>

        {/* Admin */}
        {user?.is_admin ? (
          <View style={{ paddingHorizontal: space[4] }}>
            <RowGroup title="Admin">
              <ListRow icon="shield-checkmark" iconTone="brand" label="Admin Cockpit" caption="Accounts · Agents · Brands · Admin Portal · Reviews" onPress={() => router.push("/admin" as any)} last testID="menu-admin-cockpit" />
            </RowGroup>
          </View>
        ) : null}

        {/* Menu groups */}
        <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
          {groups.map((g) => (
            <RowGroup key={g.title} title={g.title}>
              {g.rows.map((m, i) => {
                const locked = m.requires === "agent" && !user?.is_agent && !(m.route === "/agency" && (agency.invites > 0 || !!agency.name));
                return (
                  <ListRow
                    key={m.label}
                    icon={m.icon}
                    iconTone={m.tone ?? "default"}
                    label={m.label}
                    onPress={() => router.push(m.route as any)}
                    last={i === g.rows.length - 1}
                    testID={`menu-${m.label.toLowerCase().replace(/\s+/g, "-")}`}
                    trailing={
                      locked ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Badge label="Agents" tone="neutral" icon="lock-closed" size="xs" />
                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        </View>
                      ) : m.route === "/agency" && (agency.invites > 0 || agency.name) ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} testID="menu-agency-trailing">
                          {agency.invites > 0 ? <Badge label={`${agency.invites} invite${agency.invites === 1 ? "" : "s"}`} tone="warning" icon="mail" size="xs" /> : <Badge label={agency.name!} tone="brand" size="xs" />}
                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        </View>
                      ) : undefined
                    }
                  />
                );
              })}
            </RowGroup>
          ))}

          <Button label="Sign out" variant="destructive" iconLeft="log-out-outline" fullWidth size="lg" onPress={doSignOut} testID="sign-out-button" />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space[4], paddingTop: space[2] },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  themeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  progress: { marginHorizontal: space[4], padding: space[4], borderRadius: radii.lg, flexDirection: "row", alignItems: "center", gap: 10 },
  step: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 26, borderRadius: radii.pill },
  walletWrap: { marginHorizontal: space[4] },
  wallet: { borderRadius: radii.xl, padding: 20, overflow: "hidden" },
  walletTopup: { position: "absolute", top: 20, right: 20 },
  walletCoin: { position: "absolute", right: -28, top: -30, opacity: 0.14 },
  walletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  walletFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  fixPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radii.pill },
  coinDot: { width: 8, height: 8, borderRadius: 4 },
  stats: { flexDirection: "row", gap: space[3], paddingHorizontal: space[4] },
});
