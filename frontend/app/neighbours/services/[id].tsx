/**
 * Service request detail — status timeline, photos, manager updates, FIXA hand-off.
 * The "Find a FIXA pro" path opens the free FIXA directory (contact is always visible).
 */
import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ServiceRequest } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";
import { SR_CATEGORY_ICON, SR_STATUS } from "@/src/components/neighbours/ServiceRequestRow";
import { AuthedImage } from "@/src/components/neighbours/AuthedImage";
import { timeAgo } from "@/src/components/neighbours/PostRow";

type Status = "acknowledged" | "in_progress" | "resolved" | "closed";

export default function ServiceRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [r, setR] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<"forbidden" | "other" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updateOpen, setUpdateOpen] = useState<Status | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setR(await api.serviceRequest(id));
    } catch (e: any) {
      setError(e?.status === 403 || e?.status === 404 ? "forbidden" : "other");
    } finally {
      setRefreshing(false);
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const update = async () => {
    if (!r || !updateOpen) return;
    setBusy(true);
    try {
      await api.serviceRequestUpdate(r.id, { status: updateOpen, note: note.trim() || undefined });
      toast.success(`Marked ${SR_STATUS[updateOpen].label.toLowerCase()}`);
      setUpdateOpen(null);
      setNote("");
      load();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Request" />
        <EmptyState icon="lock-closed-outline" variant={error === "forbidden" ? "empty" : "error"} title={error === "forbidden" ? "Not available" : "Couldn't load request"} body={error === "forbidden" ? "Only the reporter and estate management can see this request." : undefined} actionLabel={error === "forbidden" ? "Back" : "Retry"} onAction={error === "forbidden" ? () => router.back() : load} />
      </Screen>
    );
  }

  const s = r ? SR_STATUS[r.status] : null;
  const open = r ? !["resolved", "closed"].includes(r.status) : false;
  const nextForManager: Status[] = r?.status === "open" ? ["acknowledged", "in_progress", "resolved"] : r?.status === "acknowledged" ? ["in_progress", "resolved"] : r?.status === "in_progress" ? ["resolved"] : r?.status === "resolved" ? ["closed"] : [];

  return (
    <Screen testID="service-detail-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={r?.title ?? "Request"} subtitle={r ? `${r.category.replace(/_/g, " ")} · ${s!.label}` : undefined} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: space[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}>
        {!r ? (
          <SkeletonRows rows={5} />
        ) : (
          <>
            <Card elevation="sm" style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.icon, { backgroundColor: colors.fixSoft }]}>
                  <Ionicons name={SR_CATEGORY_ICON[r.category] ?? "construct"} size={22} color={colors.fix} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    <Badge label={s!.label} tone={s!.tone} icon={s!.icon} size="xs" />
                    {r.urgent ? <Badge label="Urgent" tone="error" size="xs" /> : null}
                  </View>
                  <AppText variant="micro" tone="tertiary">
                    Reported {timeAgo(r.created_at)}
                    {r.location_label ? ` · ${r.location_label}` : ""}
                  </AppText>
                </View>
              </View>
              <AppText variant="body">{r.description}</AppText>
              {r.photos?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {r.photos.map((p, i) => (
                    <Pressable key={p} onPress={() => setPhoto(p)} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`} testID={`sr-photo-${i}`}>
                      <AuthedImage url={p} style={styles.photo} />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              {r.reporter ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Avatar name={r.reporter.full_name} uri={r.reporter.avatar_url} size={24} tone="soft" />
                  <AppText variant="micro" tone="tertiary">
                    {r.is_mine ? "Reported by you" : `Reported by ${r.reporter.full_name}`} · visible to management only
                  </AppText>
                </View>
              ) : null}
            </Card>

            {r.fixa_provider ? (
              <Card elevation="none" style={{ backgroundColor: colors.fixSoft, borderColor: "transparent" }} testID="sr-fixa">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Ionicons name="hammer" size={22} color={colors.fix} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium">FIXA professional assigned</AppText>
                    <AppText variant="caption" tone="secondary">
                      {r.fixa_provider.name}
                      {r.fixa_provider.subcategory ? ` · ${r.fixa_provider.subcategory}` : ""}
                    </AppText>
                  </View>
                  <Button label="View" size="xs" variant="fix" onPress={() => router.push(`/fixa/${r.fixa_provider!.id}` as any)} />
                </View>
              </Card>
            ) : null}

            {/* Timeline */}
            <View style={{ gap: 8 }}>
              <AppText variant="label" tone="tertiary" uppercase>
                Progress
              </AppText>
              {[...r.updates].reverse().map((u, i) => {
                const us = SR_STATUS[u.status as ServiceRequest["status"]] ?? SR_STATUS.open;
                return (
                  <View key={`${u.at}-${i}`} style={{ flexDirection: "row", gap: 10 }} testID={`sr-update-${i}`}>
                    <View style={{ alignItems: "center" }}>
                      <View style={[styles.dot, { backgroundColor: i === 0 ? colors.fix : colors.borderStrong }]} />
                      {i < r.updates.length - 1 ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 12, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <AppText variant="bodyMedium">{us.label}</AppText>
                        <AppText variant="micro" tone="tertiary">
                          · {timeAgo(u.at)}
                          {u.user ? ` · ${u.user.full_name}` : ""}
                        </AppText>
                      </View>
                      {u.note ? (
                        <AppText variant="bodySm" tone="secondary">
                          {u.note}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Actions */}
            {r.can_manage && open ? (
              <View style={{ gap: 8 }}>
                <AppText variant="label" tone="tertiary" uppercase>
                  Management actions
                </AppText>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {nextForManager.map((st) => (
                    <Button key={st} label={SR_STATUS[st].label} size="sm" variant={st === "resolved" ? "primary" : "secondary"} iconLeft={SR_STATUS[st].icon} onPress={() => setUpdateOpen(st)} testID={`sr-set-${st}`} />
                  ))}
                </View>
                <Button label="Find a FIXA professional" variant="fix" fullWidth iconLeft="hammer-outline" onPress={() => router.push("/fixa" as any)} testID="sr-find-fixa" />
                <AppText variant="micro" tone="tertiary">
                  FIXA is free — every verified pro shows their phone and WhatsApp, so you can call before booking.
                </AppText>
              </View>
            ) : null}
            {r.can_manage && r.status === "resolved" ? <Button label="Close request" variant="secondary" fullWidth iconLeft="lock-closed-outline" onPress={() => setUpdateOpen("closed")} testID="sr-set-closed" /> : null}
            {!r.can_manage && r.is_mine && open ? <Button label="Resolved — close my request" variant="secondary" fullWidth iconLeft="checkmark-done-outline" onPress={() => setUpdateOpen("closed")} testID="sr-close-mine" /> : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={!!updateOpen} onClose={() => setUpdateOpen(null)} title={updateOpen ? `Mark as ${SR_STATUS[updateOpen].label.toLowerCase()}` : ""} testID="sr-update-sheet">
        <View style={{ gap: 10 }}>
          <Input value={note} onChangeText={setNote} placeholder="Add a note for the resident (optional)" multiline maxLength={600} style={{ minHeight: 80, textAlignVertical: "top" }} testID="sr-update-note" />
          <Button label="Confirm" size="lg" fullWidth loading={busy} onPress={update} testID="sr-update-confirm" />
        </View>
      </Sheet>
      <Sheet visible={!!photo} onClose={() => setPhoto(null)} title="Photo">
        {photo ? <AuthedImage url={photo} style={{ width: "100%", height: 320, borderRadius: radii.md }} contentFit="contain" /> : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  photo: { width: 110, height: 110, borderRadius: radii.md },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  line: { width: 2, flex: 1, marginTop: 2 },
});
