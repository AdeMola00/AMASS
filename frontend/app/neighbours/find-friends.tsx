/**
 * Find friends — search by name/handle, or (optionally) match phone contacts.
 * Contact matching: permission asked only after the user taps "Find from contacts", with a
 * plain-language explanation and "Not now". Numbers are hashed on this device (SHA-256 of
 * E.164); the server never receives or stores the address book.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Linking, Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import { api, ConnectionState, PublicUser, SocialMe } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";
import { UserRow } from "@/src/components/neighbours/UserRow";

type Found = PublicUser & { connection: ConnectionState };

function toE164(raw: string, defaultDial = "+234") {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    d = d.replace(/^0/, "");
    d = defaultDial + d;
  }
  return /^\+[1-9]\d{6,14}$/.test(d) ? d : null;
}

export default function FindFriendsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [me, setMe] = useState<SocialMe | null>(null);
  const [explain, setExplain] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<Found[] | null>(null);
  const [denied, setDenied] = useState<{ canAskAgain: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.socialMe().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await api.socialSearch(q.trim()));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [q]);

  const runMatch = async () => {
    setExplain(false);
    if (Platform.OS === "web") {
      toast.info("Contacts aren't available on web", "Open AMASS on your phone to match contacts, or search by name.");
      return;
    }
    try {
      const current = await Contacts.getPermissionsAsync();
      let status = current.status;
      let canAskAgain = current.canAskAgain;
      if (status !== "granted") {
        if (!canAskAgain) {
          setDenied({ canAskAgain: false });
          return;
        }
        const r = await Contacts.requestPermissionsAsync();
        status = r.status;
        canAskAgain = r.canAskAgain;
      }
      if (status !== "granted") {
        setDenied({ canAskAgain });
        return;
      }
      setMatching(true);
      track("contact_match_optin");
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
      const numbers = new Set<string>();
      for (const c of data) for (const p of c.phoneNumbers ?? []) {
        const e = toE164(p.number ?? "");
        if (e) numbers.add(e);
      }
      const hashes = await Promise.all([...numbers].slice(0, 2000).map((n) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, n)));
      const r = await api.socialContactsMatch(hashes);
      setMatches(r.matches);
      if (!r.discoverable) toast.info("Tip: let friends find you too", "Turn on “Discoverable by contacts” in Neighbours settings.");
    } catch (e: any) {
      toast.error("Couldn't match contacts", e?.message);
    } finally {
      setMatching(false);
    }
  };

  const openSettings = () => Linking.openSettings();

  return (
    <Screen testID="find-friends-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Find friends" subtitle="Partners · friends · housemates" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: space[3] }} keyboardShouldPersistTaps="handled">
        <Input value={q} onChangeText={setQ} placeholder="Search by name or @handle" iconLeft="search-outline" autoCapitalize="none" autoCorrect={false} size="lg" testID="find-search" />
        {q.trim().length >= 2 ? (
          searching && !results ? (
            <SkeletonRows rows={3} />
          ) : results && results.length ? (
            results.map((u) => <UserRow key={u.id} user={u} connection={u.connection} />)
          ) : (
            <EmptyState compact icon="person-outline" title="No one found" body="They may have turned off discovery. Try their @handle or send them your invite link." testID="find-empty" />
          )
        ) : null}

        {/* Contact matching */}
        {matches ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <AppText variant="label" tone="tertiary" uppercase>
                From your contacts · {matches.length}
              </AppText>
              <Button label="Refresh" variant="ghost" size="xs" onPress={runMatch} loading={matching} />
            </View>
            {matches.length === 0 ? (
              <EmptyState compact icon="people-outline" title="None of your contacts are on AMASS yet" body="Only people who chose to be discoverable appear here. Invite them with your link below." />
            ) : (
              matches.map((u) => <UserRow key={u.id} user={u} connection={u.connection} caption="In your contacts" />)
            )}
          </>
        ) : (
          <Card elevation="sm" style={{ gap: 10 }} testID="contacts-card">
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="people-circle" size={26} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="title">Find from contacts</AppText>
                <AppText variant="caption" tone="secondary">
                  See which contacts already use AMASS. Optional, and private.
                </AppText>
              </View>
            </View>
            <Button label="Find from contacts" iconLeft="phone-portrait-outline" fullWidth onPress={() => setExplain(true)} loading={matching} testID="contacts-start" />
          </Card>
        )}

        {denied ? (
          <Card elevation="none" style={{ backgroundColor: colors.warningSoft, borderColor: "transparent", gap: 8 }} testID="contacts-denied">
            <AppText variant="bodyMedium">Contacts access is off</AppText>
            <AppText variant="caption" tone="secondary">
              No problem — you can still search by name or share your invite link. To match contacts later, allow access in Settings.
            </AppText>
            <Button label="Open Settings" variant="secondary" size="sm" iconLeft="settings-outline" onPress={openSettings} testID="contacts-open-settings" />
          </Card>
        ) : null}

        {/* Invite link / handle */}
        <Card elevation="none" style={{ borderColor: colors.border, gap: 8 }}>
          <AppText variant="bodyMedium">Your handle</AppText>
          {me?.handle ? (
            <AppText variant="body" tone="secondary">
              Friends can find you as <AppText variant="bodyMedium">@{me.handle}</AppText>.
            </AppText>
          ) : (
            <AppText variant="caption" tone="secondary">
              Set a handle so friends can find you without sharing your number.
            </AppText>
          )}
          <Button label={me?.handle ? "Edit handle & privacy" : "Choose a handle"} variant="secondary" size="sm" iconLeft="at" onPress={() => router.push("/neighbours/settings" as any)} testID="find-set-handle" />
        </Card>
      </ScrollView>

      {/* Pre-permission explanation */}
      <Sheet visible={explain} onClose={() => setExplain(false)} title="Match your contacts?" testID="contacts-explain">
        <View style={{ gap: 12 }}>
          {[
            ["lock-closed", "Numbers are scrambled on your phone before anything is sent. We never see or store your address book."],
            ["eye-off", "You'll only see contacts who chose to be discoverable. Nobody's number is revealed — not yours, not theirs."],
            ["hand-left", "We never message or invite your contacts. You decide who to connect with."],
          ].map(([icon, text]) => (
            <View key={icon as string} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Ionicons name={icon as any} size={18} color={colors.text} style={{ marginTop: 2 }} />
              <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                {text}
              </AppText>
            </View>
          ))}
          <Button label="Continue" size="lg" fullWidth onPress={runMatch} testID="contacts-continue" />
          <Button label="Not now" variant="ghost" fullWidth onPress={() => setExplain(false)} testID="contacts-not-now" />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
