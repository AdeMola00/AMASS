/**
 * Estate home — a verified community's private space.
 * Non-members see a public teaser + Join. Residents get Feed · Q&A · Groups · Events · Issues · People.
 * Managers also review join requests, share/rotate the join code and post official notices.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Platform, Share } from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import { api, CommunityEvent, Estate, EstateGroup, EstateMember, EstatePost, ServiceRequest } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, Chip, EmptyState, IconButton, Input, Screen, ScreenHeader, Sheet, SkeletonCard, SkeletonRows, Tabs, useToast } from "@/src/ui";
import { PostRow } from "@/src/components/neighbours/PostRow";
import { EventRow } from "@/src/components/neighbours/EventRow";
import { UserRow } from "@/src/components/neighbours/UserRow";
import { ComposePostSheet } from "@/src/components/neighbours/ComposePostSheet";
import { JoinEstateSheet } from "@/src/components/neighbours/JoinEstateSheet";
import { AuthedImage } from "@/src/components/neighbours/AuthedImage";
import { ServiceRequestRow } from "@/src/components/neighbours/ServiceRequestRow";

type Tab = "feed" | "questions" | "groups" | "events" | "issues" | "people";

export default function EstateScreen() {
  const { id, compose, tab: tabParam } = useLocalSearchParams<{ id: string; compose?: string; tab?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [error, setError] = useState<"notfound" | "other" | null>(null);
  const [tab, setTab] = useState<Tab>((tabParam as Tab) || "feed");
  const [posts, setPosts] = useState<EstatePost[] | null>(null);
  const [groups, setGroups] = useState<EstateGroup[] | null>(null);
  const [activeGroup, setActiveGroup] = useState<EstateGroup | null>(null);
  const [events, setEvents] = useState<CommunityEvent[] | null>(null);
  const [issues, setIssues] = useState<{ items: ServiceRequest[]; is_manager: boolean } | null>(null);
  const [members, setMembers] = useState<EstateMember[] | null>(null);
  const [pending, setPending] = useState<EstateMember[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeType, setComposeType] = useState<EstatePost["type"]>("question");
  const [joinOpen, setJoinOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [proofFor, setProofFor] = useState<{ m: EstateMember; url: string; unit?: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const approved = estate?.membership?.status === "approved" || !!estate?.is_manager;
  const isManager = !!estate?.is_manager;

  const loadEstate = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setEstate(await api.estate(id));
    } catch (e: any) {
      setError(e?.status === 404 ? "notfound" : "other");
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  const loadTab = useCallback(
    async (t: Tab, group: EstateGroup | null) => {
      if (!id || !approved) return;
      try {
        if (t === "feed") setPosts((await api.estatePosts(id, { group_id: group?.id })).items);
        else if (t === "questions") setPosts((await api.estatePosts(id, { type: "question" })).items);
        else if (t === "groups") setGroups(await api.estateGroups(id));
        else if (t === "events") setEvents(await api.events({ estate_id: id }));
        else if (t === "issues") setIssues(await api.serviceRequests(id, isManager ? "all" : "mine"));
        else if (t === "people") {
          setMembers(await api.estateMembers(id, "approved"));
          if (isManager) setPending(await api.estateMembers(id, "pending"));
        }
      } catch {
        /* keep previous */
      }
    },
    [id, approved, isManager]
  );

  useFocusEffect(
    useCallback(() => {
      loadEstate();
    }, [loadEstate])
  );
  useEffect(() => {
    if (approved) {
      loadTab(tab, activeGroup);
      if (groups === null) api.estateGroups(id!).then(setGroups).catch(() => {});
    }
  }, [approved, tab, activeGroup, loadTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (compose && approved) {
      setComposeType((compose as EstatePost["type"]) || "question");
      setComposeOpen(true);
      router.setParams({ compose: undefined } as any);
    }
  }, [compose, approved, router]);

  const shareCode = async () => {
    if (!estate?.join_code) return;
    const msg = `Join ${estate.name} on AMASS Neighbours with code ${estate.join_code}`;
    if (Platform.OS === "web") {
      await Clipboard.setStringAsync(estate.join_code);
      toast.success("Join code copied");
    } else {
      try {
        await Share.share({ message: msg });
      } catch {}
    }
  };
  const rotateCode = async () => {
    if (!estate) return;
    setBusy("rotate");
    try {
      const r = await api.estatePatch(estate.id, { rotate_join_code: true });
      setEstate({ ...estate, join_code: r.join_code ?? estate.join_code });
      toast.success("New join code issued", "The old code no longer works.");
    } catch (e: any) {
      toast.error("Couldn't rotate code", e?.message);
    } finally {
      setBusy(null);
    }
  };
  const review = async (m: EstateMember, action: "approve" | "reject" | "make_manager" | "remove") => {
    if (!estate) return;
    setBusy(m.id);
    try {
      await api.estateReviewMember(estate.id, m.id, action);
      toast.success(action === "approve" ? `${m.user.full_name.split(" ")[0]} is now a verified resident` : action === "reject" ? "Request declined" : action === "make_manager" ? "Made a manager" : "Removed");
      setProofFor(null);
      loadTab("people", null);
      loadEstate();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    } finally {
      setBusy(null);
    }
  };
  const openProof = async (m: EstateMember) => {
    if (!estate) return;
    try {
      const r = await api.estateMemberProof(estate.id, m.id);
      setProofFor({ m, url: r.proof_url, unit: r.unit });
    } catch (e: any) {
      toast.error("No proof attached", e?.message);
    }
  };
  const toggleGroup = async (g: EstateGroup) => {
    setBusy(g.id);
    try {
      const r = await api.groupMembership(g.id, g.joined ? "leave" : "join");
      setGroups((prev) => prev?.map((x) => (x.id === g.id ? { ...x, joined: r.joined, member_count: x.member_count + (r.joined ? 1 : -1) } : x)) ?? null);
    } catch (e: any) {
      toast.error("Couldn't update group", e?.message);
    } finally {
      setBusy(null);
    }
  };
  const leave = async () => {
    if (!estate) return;
    try {
      await api.estateLeave(estate.id);
      toast.info(`You left ${estate.name}`);
      router.back();
    } catch (e: any) {
      toast.error("Couldn't leave", e?.message);
    }
  };

  if (error) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Estate" />
        <EmptyState variant={error === "notfound" ? "empty" : "error"} icon="business-outline" title={error === "notfound" ? "Estate not found" : "Couldn't load estate"} actionLabel={error === "notfound" ? "Browse estates" : "Retry"} onAction={error === "notfound" ? () => router.replace("/neighbours/estates" as any) : loadEstate} />
      </Screen>
    );
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "feed", label: "Feed" },
    { key: "questions", label: "Q&A", badge: estate?.open_questions || undefined },
    { key: "groups", label: "Groups" },
    { key: "events", label: "Events", badge: estate?.upcoming_events || undefined },
    { key: "issues", label: "Issues" },
    { key: "people", label: "People", badge: isManager ? estate?.pending_requests || undefined : undefined },
  ];

  return (
    <Screen testID="estate-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={estate?.name ?? "Estate"}
        subtitle={estate ? [estate.area, estate.city].filter(Boolean).join(", ") : undefined}
        right={
          approved ? (
            <View style={{ flexDirection: "row", gap: 4 }}>
              {isManager ? <IconButton icon="key-outline" label="Join code" onPress={() => setCodeOpen(true)} testID="estate-code" /> : null}
              <IconButton icon="create-outline" label="New post" onPress={() => { setComposeType(tab === "questions" ? "question" : "general"); setComposeOpen(true); }} testID="estate-compose" />
            </View>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 80, gap: space[3] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEstate(); loadTab(tab, activeGroup); }} tintColor={colors.text} />} stickyHeaderIndices={approved ? [1] : undefined}>
        {/* Hero */}
        <View style={{ paddingHorizontal: space[4], gap: 10 }}>
          {!estate ? (
            <SkeletonCard />
          ) : (
            <Card elevation="sm" padded={false} style={{ overflow: "hidden" }}>
              {estate.cover_image ? <Image source={{ uri: estate.cover_image }} style={styles.cover} contentFit="cover" transition={150} /> : null}
              <View style={{ padding: 14, gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <Badge label="Verified estate" tone="info" icon="checkmark-circle" size="xs" />
                  {estate.membership?.status === "approved" ? <Badge label={estate.membership.role === "manager" ? "You manage this estate" : "Verified resident"} tone={estate.membership.role === "manager" ? "brand" : "success"} icon="shield-checkmark" size="xs" /> : null}
                  {estate.membership?.status === "pending" ? <Badge label="Verification pending" tone="warning" icon="time" size="xs" /> : null}
                  {estate.pilot ? <Badge label="Pilot" tone="premium" size="xs" /> : null}
                </View>
                <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
                  <Stat icon="people-outline" label={`${estate.member_count ?? 0} residents`} />
                  <Stat icon="calendar-outline" label={`${estate.upcoming_events ?? 0} upcoming`} />
                  <Stat icon="help-circle-outline" label={`${estate.open_questions ?? 0} open questions`} />
                </View>
                {estate.description ? (
                  <AppText variant="bodySm" tone="secondary">
                    {estate.description}
                  </AppText>
                ) : null}
                {estate.amenities?.length ? (
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    {estate.amenities.slice(0, 8).map((a) => (
                      <Badge key={a} label={a} tone="neutral" size="xs" />
                    ))}
                  </View>
                ) : null}
                {!approved ? (
                  estate.membership?.status === "pending" ? (
                    <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
                      <Ionicons name="time-outline" size={18} color={colors.warning} />
                      <AppText variant="caption" style={{ flex: 1 }}>
                        Estate management is verifying your residence. You’ll get a notification once approved.
                      </AppText>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {estate.teaser ? (
                        <AppText variant="caption" tone="tertiary">
                          {estate.teaser.recent_activity_count} posts in the last 30 days · residents only
                        </AppText>
                      ) : null}
                      <Button label={estate.membership?.status === "rejected" ? "Try again with a join code" : "Join as a resident"} size="lg" fullWidth iconLeft="shield-checkmark-outline" onPress={() => setJoinOpen(true)} testID="estate-join" />
                      <AppText variant="micro" tone="tertiary" align="center">
                        Join with a code from management, or request verification. Your address stays private.
                      </AppText>
                    </View>
                  )
                ) : null}
                {estate.managers?.length ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText variant="micro" tone="tertiary">
                      Managed by
                    </AppText>
                    {estate.managers.slice(0, 4).map((m) => (
                      <Pressable key={m.id} onPress={() => router.push(`/neighbours/users/${m.id}` as any)} accessibilityRole="button" accessibilityLabel={m.full_name}>
                        <Avatar name={m.full_name} uri={m.avatar_url} size={24} tone="soft" />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </Card>
          )}
        </View>

        {/* Tabs (sticky) */}
        {approved && estate ? (
          <View style={{ backgroundColor: colors.bg, paddingHorizontal: space[4], paddingVertical: 6 }}>
            <Tabs tabs={tabs} value={tab} onChange={(t) => { setTab(t); if (t !== "feed") setActiveGroup(null); }} testID="estate-tabs" />
          </View>
        ) : null}

        {approved && estate ? (
          <View style={{ paddingHorizontal: space[4], gap: 10 }}>
            {tab === "feed" ? (
              <>
                {groups?.some((g) => g.joined) ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Chip label="Everyone" selected={!activeGroup} onPress={() => setActiveGroup(null)} testID="feed-group-all" />
                    {groups.filter((g) => g.joined).map((g) => (
                      <Chip key={g.id} label={`${g.emoji ?? ""} ${g.name}`.trim()} selected={activeGroup?.id === g.id} onPress={() => setActiveGroup(g)} testID={`feed-group-${g.id}`} />
                    ))}
                  </ScrollView>
                ) : null}
                {posts === null ? (
                  <SkeletonRows rows={4} />
                ) : posts.length === 0 ? (
                  <EmptyState compact icon="chatbubbles-outline" title={activeGroup ? `Nothing in ${activeGroup.name} yet` : "Quiet so far"} body="Introduce yourself or ask the first question — neighbours answer fast." actionLabel="Say hello" onAction={() => { setComposeType("general"); setComposeOpen(true); }} testID="feed-empty" />
                ) : (
                  posts.map((p) => <PostRow key={p.id} post={p} onPress={() => router.push(`/neighbours/posts/${p.id}` as any)} />)
                )}
              </>
            ) : null}

            {tab === "questions" ? (
              <>
                <Pressable onPress={() => { setComposeType("question"); setComposeOpen(true); }} style={[styles.askBox, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" testID="ask-question">
                  <Ionicons name="help-circle-outline" size={20} color={colors.info} />
                  <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                    Ask neighbours anything — plumbers, schools, water schedule…
                  </AppText>
                  <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                </Pressable>
                {posts === null ? <SkeletonRows rows={4} /> : posts.length === 0 ? <EmptyState compact icon="help-circle-outline" title="No questions yet" body="Be the first to ask." testID="questions-empty" /> : posts.map((p) => <PostRow key={p.id} post={p} onPress={() => router.push(`/neighbours/posts/${p.id}` as any)} />)}
              </>
            ) : null}

            {tab === "groups" ? (
              <>
                <AppText variant="caption" tone="secondary">
                  Interest groups keep the main feed calm — parents, fitness, security watch, pets…
                </AppText>
                {groups === null ? (
                  <SkeletonRows rows={3} />
                ) : (
                  groups.map((g) => (
                    <View key={g.id} style={[styles.groupRow, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`group-${g.id}`}>
                      <AppText variant="h3">{g.emoji ?? "✨"}</AppText>
                      <Pressable style={{ flex: 1 }} onPress={() => { if (g.joined) { setActiveGroup(g); setTab("feed"); } }} accessibilityRole="button" accessibilityLabel={`Open ${g.name}`}>
                        <AppText variant="bodyMedium">{g.name}</AppText>
                        <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                          {g.member_count} member{g.member_count === 1 ? "" : "s"}
                          {g.description ? ` · ${g.description}` : ""}
                        </AppText>
                      </Pressable>
                      <Button label={g.joined ? "Joined" : "Join"} size="xs" variant={g.joined ? "ghost" : "secondary"} iconLeft={g.joined ? "checkmark" : undefined} loading={busy === g.id} onPress={() => toggleGroup(g)} testID={`group-toggle-${g.id}`} />
                    </View>
                  ))
                )}
                <Button label="Start a group" variant="secondary" iconLeft="add" fullWidth onPress={() => setGroupOpen(true)} testID="group-create" />
              </>
            ) : null}

            {tab === "events" ? (
              <>
                <Button label="Host an event" variant="secondary" iconLeft="calendar-outline" fullWidth onPress={() => router.push(`/neighbours/events/new?estate_id=${estate.id}` as any)} testID="estate-host-event" />
                {events === null ? <SkeletonRows rows={3} /> : events.length === 0 ? <EmptyState compact icon="calendar-outline" title="No upcoming events" body="Residents' meetings, viewings, clean-ups — host one." testID="events-empty" /> : events.map((ev) => <EventRow key={ev.id} event={ev} onPress={() => router.push(`/neighbours/events/${ev.id}` as any)} />)}
              </>
            ) : null}

            {tab === "issues" ? (
              <>
                <Card elevation="none" style={{ backgroundColor: colors.fixSoft, borderColor: "transparent" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Ionicons name="construct" size={22} color={colors.fix} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyMedium">Report a maintenance issue</AppText>
                      <AppText variant="caption" tone="secondary">
                        Tracked to resolution by management — not a feed post. Urgent issues notify managers immediately.
                      </AppText>
                    </View>
                    <Button label="Report" size="sm" variant="fix" onPress={() => router.push(`/neighbours/services/new?estate_id=${estate.id}` as any)} testID="estate-report-issue" />
                  </View>
                </Card>
                {issues === null ? <SkeletonRows rows={3} /> : issues.items.length === 0 ? <EmptyState compact icon="checkmark-done-outline" title={isManager ? "No open requests" : "You haven't reported anything"} body={isManager ? "Residents' maintenance requests land here." : "Your requests and their progress will show here."} testID="issues-empty" /> : issues.items.slice(0, 8).map((sr) => <ServiceRequestRow key={sr.id} request={sr} onPress={() => router.push(`/neighbours/services/${sr.id}` as any)} />)}
                {issues && issues.items.length > 0 ? <Button label="See all requests" variant="ghost" size="sm" onPress={() => router.push(`/neighbours/services?estate_id=${estate.id}` as any)} testID="estate-all-issues" /> : null}
              </>
            ) : null}

            {tab === "people" ? (
              <>
                {isManager && pending && pending.length ? (
                  <View style={{ gap: 8 }}>
                    <AppText variant="label" tone="tertiary" uppercase>
                      Join requests · {pending.length}
                    </AppText>
                    {pending.map((m) => (
                      <UserRow
                        key={m.id}
                        user={m.user}
                        caption={`${m.verification_method === "join_code" ? "Used a join code" : m.has_proof ? "Attached proof" : "Requested"}${m.note ? ` · “${m.note}”` : ""}`}
                        testID={`pending-${m.id}`}
                        trailing={
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            {m.has_proof ? <IconButton icon="document-text-outline" label="View proof" size={34} iconSize={16} onPress={() => openProof(m)} testID={`proof-${m.id}`} /> : null}
                            <IconButton icon="close" label="Decline" size={34} iconSize={16} variant="ghost" onPress={() => review(m, "reject")} disabled={busy === m.id} testID={`reject-${m.id}`} />
                            <Button label="Approve" size="xs" loading={busy === m.id} onPress={() => review(m, "approve")} testID={`approve-${m.id}`} />
                          </View>
                        }
                      />
                    ))}
                  </View>
                ) : null}
                <AppText variant="label" tone="tertiary" uppercase>
                  Residents
                </AppText>
                {members === null ? (
                  <SkeletonRows rows={5} />
                ) : (
                  members.map((m) => (
                    <UserRow
                      key={m.id}
                      user={m.user}
                      caption={m.role === "manager" ? "Estate manager" : `Resident since ${new Date(m.approved_at ?? m.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}
                      testID={`member-${m.id}`}
                      trailing={isManager && m.role !== "manager" ? <IconButton icon="ellipsis-horizontal" label="Manage resident" size={34} iconSize={16} variant="ghost" onPress={() => setProofFor({ m, url: "", unit: null })} testID={`manage-${m.id}`} /> : undefined}
                    />
                  ))
                )}
                <AppText variant="micro" tone="tertiary" align="center">
                  Phone numbers and house numbers are never shown here.
                </AppText>
              </>
            ) : null}

            <Button label="Leave estate" variant="ghost" size="sm" iconLeft="exit-outline" onPress={leave} style={{ alignSelf: "center", marginTop: 8 }} testID="estate-leave" />
          </View>
        ) : null}
      </ScrollView>

      {estate ? <JoinEstateSheet visible={joinOpen} onClose={() => setJoinOpen(false)} estate={estate} onJoined={() => loadEstate()} /> : null}
      {estate && approved ? <ComposePostSheet visible={composeOpen} onClose={() => setComposeOpen(false)} estateId={estate.id} isManager={isManager} groups={groups ?? []} defaultType={composeType} groupId={activeGroup?.id ?? null} onCreated={() => { loadTab(tab === "questions" ? "questions" : "feed", activeGroup); loadEstate(); }} /> : null}

      {/* Manager: join code */}
      <Sheet visible={codeOpen} onClose={() => setCodeOpen(false)} title="Resident join code" testID="code-sheet">
        <View style={{ gap: 12, alignItems: "center" }}>
          <AppText variant="display" tabular testID="estate-join-code">
            {estate?.join_code ?? "——"}
          </AppText>
          <AppText variant="caption" tone="secondary" align="center">
            Share with residents only (notice board, WhatsApp group, estate office). Requests made with the code still need your approval. Rotate it any time.
          </AppText>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label={Platform.OS === "web" ? "Copy code" : "Share code"} iconLeft="share-outline" onPress={shareCode} testID="estate-share-code" />
            <Button label="Rotate" variant="secondary" iconLeft="refresh" loading={busy === "rotate"} onPress={rotateCode} testID="estate-rotate-code" />
          </View>
        </View>
      </Sheet>

      {/* Group create */}
      <GroupSheet visible={groupOpen} onClose={() => setGroupOpen(false)} estateId={estate?.id} onCreated={(g) => setGroups((prev) => [...(prev ?? []), g])} />

      {/* Manager: proof / manage member */}
      <Sheet visible={!!proofFor} onClose={() => setProofFor(null)} title={proofFor?.url ? "Proof of residence" : "Manage resident"} testID="proof-sheet">
        {proofFor ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar name={proofFor.m.user.full_name} uri={proofFor.m.user.avatar_url} size={40} tone="soft" />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium">{proofFor.m.user.full_name}</AppText>
                {proofFor.unit ? (
                  <AppText variant="micro" tone="tertiary">
                    Unit {proofFor.unit} · private
                  </AppText>
                ) : null}
              </View>
            </View>
            {proofFor.url ? <AuthedImage url={proofFor.url} style={styles.proof} contentFit="contain" testID="proof-image" /> : null}
            {proofFor.m.status === "pending" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Decline" variant="secondary" style={{ flex: 1 }} loading={busy === proofFor.m.id} onPress={() => review(proofFor.m, "reject")} />
                <Button label="Approve resident" style={{ flex: 1 }} loading={busy === proofFor.m.id} onPress={() => review(proofFor.m, "approve")} testID="proof-approve" />
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Button label="Make manager" variant="secondary" fullWidth iconLeft="shield-checkmark-outline" loading={busy === proofFor.m.id} onPress={() => review(proofFor.m, "make_manager")} testID="member-make-manager" />
                <Button label="Remove from estate" variant="destructive" fullWidth iconLeft="person-remove-outline" loading={busy === proofFor.m.id} onPress={() => review(proofFor.m, "remove")} testID="member-remove" />
              </View>
            )}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function GroupSheet({ visible, onClose, estateId, onCreated }: { visible: boolean; onClose: () => void; estateId?: string; onCreated: (g: EstateGroup) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!estateId || name.trim().length < 2) return;
    setBusy(true);
    try {
      const g = await api.estateGroupCreate(estateId, { name: name.trim(), emoji, description: desc.trim() || undefined });
      onCreated(g);
      toast.success(`${g.name} created`);
      setName("");
      setDesc("");
      onClose();
    } catch (e: any) {
      toast.error("Couldn't create group", e?.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Start a group" testID="group-sheet">
      <View style={{ gap: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {["✨", "👶", "🏃", "🐶", "🛡️", "🌿", "🎉", "📚", "⚽", "🍲"].map((e) => (
            <Chip key={e} label={e} selected={emoji === e} onPress={() => setEmoji(e)} />
          ))}
        </ScrollView>
        <Input value={name} onChangeText={setName} placeholder="Group name · e.g. Parents of Phase 2" maxLength={60} testID="group-name" />
        <Input value={desc} onChangeText={setDesc} placeholder="What's it for? (optional)" maxLength={200} testID="group-desc" />
        <Button label="Create group" size="lg" fullWidth disabled={name.trim().length < 2} loading={busy} onPress={submit} testID="group-submit" />
      </View>
    </Sheet>
  );
}

function Stat({ icon, label }: { icon: any; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons name={icon} size={13} color={colors.textTertiary} />
      <AppText variant="micro" tone="secondary" tabular>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: 150 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  askBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  proof: { width: "100%", height: 260, borderRadius: radii.md, backgroundColor: "rgba(0,0,0,0.04)" },
});
