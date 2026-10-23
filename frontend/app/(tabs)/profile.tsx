import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/contexts/auth";
import { useWallet } from "@/src/contexts/wallet";
import { api } from "@/src/lib/api";
import { useTheme, useThemeMode } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, Avatar, Badge, Button, ListRow, RowGroup, Screen, StatTile, type IconName, Gloss } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";

type Row = { icon: IconName; label: string; route: string; caption?: string; requires?: "agent"; tone?: "default" | "brand" | "mass" | "fix" | "success" | "warning" | "info" | "premium" };

// Ordered by product priority (see spec); grouped for scannability.
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Wallet & rewards",
    rows: [
      { icon: "wallet-outline", label: "Wallet", route: "/wallet", caption: "MASS · FIX · Transactions · Subscriptions", tone: "mass" },
      { icon: "lock-open-outline", label: "My Unlocks", route: "/unlocks", caption: "Properties you've unlocked" },
      { icon: "heart-outline", label: "Saved Properties", route: "/saved-properties", caption: "Your favorites", tone: "brand" },
      { icon: "bookmark-outline", label: "Saved Searches", route: "/saved-searches", caption: "Alerts when new listings match" },
      { icon: "gift-outline", label: "Earn Tokens", route: "/earn", caption: "Tasks · Referrals · Daily bonuses", tone: "success" },
    ],
  },
  {
    title: "Agents & listings",
    rows: [
      { icon: "ribbon-outline", label: "Become an Agent", route: "/become-agent", caption: "Verified authority to market properties", tone: "brand" },
      { icon: "add-circle-outline", label: "List a Property", route: "/submit-property", caption: "Publish a new listing" },
      { icon: "briefcase-outline", label: "Agent Workspace", route: "/agent-workspace", caption: "Referrals · Commissions · Payouts", requires: "agent" },
      { icon: "pricetags-outline", label: "Agent Plans", route: "/agent-plans", caption: "Starter · Pro · Agency · Founding pricing", tone: "premium" },
    ],
  },
  {
    title: "Services",
    rows: [
      { icon: "storefront-outline", label: "My Market Listings", route: "/marketplace/my-listings", caption: "Declutter items · Offers in & out · Sales", tone: "brand" },
      { icon: "hammer-outline", label: "Provider Dashboard", route: "/provider-dashboard", caption: "FIXA jobs · FIX earnings · Boost", tone: "fix" },
      { icon: "construct-outline", label: "Improve My Property", route: "/improve", caption: "Inspections · Financing · Renovation", tone: "info" },
      { icon: "megaphone-outline", label: "My Ad Campaigns", route: "/ads", caption: "Analytics · AI coach · Pause/refund" },
    ],
  },
  {
    title: "Trust & documents",
    rows: [
      { icon: "document-text-outline", label: "My Documents", route: "/my-documents", caption: "Contracts & titles" },
      { icon: "shield-checkmark-outline", label: "Identity Verification", route: "/identity-verification", caption: "Enhance trust", tone: "success" },
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

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { mass, fix } = useWallet();
  const { colors, isDark } = useTheme();
  const { mode, setMode } = useThemeMode();

  const [saved, setSaved] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      // listFavorites keeps the count consistent with the Saved Properties screen.
      api.listFavorites().then((r) => setSaved(r.length)).catch(() => setSaved(0));
      api.walletUnlocks().then((r) => setUnlocked((r as any[]).length)).catch(() => setUnlocked(0));
    }, [])
  );

  const memberYear = user?.created_at ? new Date(user.created_at).getFullYear() : new Date().getFullYear();

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
            <Avatar name={user?.full_name} uri={user?.avatar_url} size={72} verified={!!user?.is_agent} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="heroSm" numberOfLines={1}>
                {user?.full_name || "AMASS Member"}
              </AppText>
              <AppText variant="bodySm" tone="tertiary" numberOfLines={1}>
                {user?.email}
              </AppText>
              <View style={styles.badges}>
                {user?.is_agent ? <Badge label="Verified Agent" tone="success" icon="shield-checkmark" testID="badge-agent" /> : <Badge label="Member" tone="neutral" icon="person" />}
                {user?.is_admin ? <Badge label="Admin" tone="brand" icon="key" /> : null}
                {(user as any)?.phone_verified ? <Badge label="Phone verified" tone="info" icon="call" /> : null}
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
              <Ionicons name={isDark ? "sunny" : "moon"} size={18} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Wallet hero — Top-up button is a sibling of the card pressable (no nested buttons on web) */}
        <View style={styles.walletWrap} testID="wallet-card-wrap">
          <LinearGradient colors={isDark ? ["#292926", "#1C1C1A"] : ["#1C1C1A", "#111111"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wallet}>
            <Gloss height="48%" opacity={0.55} />
            <View style={styles.walletCoin}>
              <TokenIcon size={120} animated />
            </View>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                router.push("/wallet");
              }}
              accessibilityRole="button"
              accessibilityLabel={`Wallet. ${mass?.spendable ?? 0} MASS and ${fix?.spendable ?? 0} FIX. Open wallet`}
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
                  <View style={[styles.coinDot, { backgroundColor: colors.fix }]} />
                  <AppText variant="caption" color="#fff" tabular>
                    {(fix?.spendable ?? 0).toLocaleString()} FIX
                  </AppText>
                </View>
                {mass?.subscription?.plan_id ? (
                  <Badge label={`${mass.subscription.plan_id} plan`} tone="premium" icon="star" />
                ) : (
                  <AppText variant="caption" color="rgba(255,255,255,0.6)">
                    Tap to manage wallet
                  </AppText>
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
          <StatTile icon="calendar" tone="mass" value={String(memberYear)} label="Member since" />
        </View>

        {/* Admin */}
        {user?.is_admin ? (
          <View style={{ paddingHorizontal: space[4] }}>
            <RowGroup title="Admin">
              <ListRow icon="shield-checkmark" iconTone="brand" label="Admin Cockpit" caption="Duplicate queue · Merge · Audit log · Representations" onPress={() => router.push("/admin" as any)} last testID="menu-admin-cockpit" />
            </RowGroup>
          </View>
        ) : null}

        {/* Menu groups */}
        <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
          {GROUPS.map((g) => (
            <RowGroup key={g.title} title={g.title}>
              {g.rows.map((m, i) => {
                const locked = m.requires === "agent" && !user?.is_agent;
                return (
                  <ListRow
                    key={m.label}
                    icon={m.icon}
                    iconTone={m.tone ?? "default"}
                    label={m.label}
                    caption={m.caption}
                    onPress={() => router.push(m.route as any)}
                    last={i === g.rows.length - 1}
                    testID={`menu-${m.label.toLowerCase().replace(/\s+/g, "-")}`}
                    trailing={
                      locked ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Badge label="Agents" tone="neutral" icon="lock-closed" size="xs" />
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
          <AppText variant="caption" tone="muted" align="center">
            Theme: {mode === "system" ? "System" : mode === "dark" ? "Dark" : "Light"} · Change in Settings
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space[4], paddingTop: space[2] },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  themeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
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
