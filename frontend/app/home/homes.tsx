/**
 * Manage homes — the places the hub tracks. Add one in three taps (name → kind → Save), rename, recolour,
 * make default, or remove (asks first when the home still has bills, records, items or repairs).
 */
import React, { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, selectedHome, withRetry, type Home, type HomeIn, type HomeKind } from "@/src/lib/homeHub";
import { AppText, Badge, Button, Chip, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";
import { ChipRow, HOME_COLORS, HOME_KINDS, HOME_KIND_ICON } from "@/src/components/home/HomeBits";
import { Field } from "@/src/components/home/FormBits";

type Draft = { id?: string; name: string; address: string; kind: HomeKind; color: string; is_default: boolean };
const blank = (count: number): Draft => ({ name: "", address: "", kind: "flat", color: HOME_COLORS[count % HOME_COLORS.length], is_default: count === 0 });

export default function ManageHomes() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const [homes, setHomes] = useState<Home[] | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const load = useCallback(async () => {
    try {
      setHomes((await homeApi.homes()).items);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openNew = () => {
    setTried(false);
    setDraft(blank(homes?.length ?? 0));
  };
  const openEdit = (h: Home) => {
    setTried(false);
    setDraft({ id: h.id, name: h.name, address: h.address ?? "", kind: h.kind, color: h.color, is_default: h.is_default });
  };

  const save = async () => {
    if (!draft) return;
    setTried(true);
    if (!draft.name.trim()) return;
    setSaving(true);
    const body: HomeIn = { name: draft.name.trim(), address: draft.address.trim() || null, kind: draft.kind, color: draft.color, is_default: draft.is_default };
    try {
      if (draft.id) {
        await withRetry(() => homeApi.updateHome(draft.id!, body));
        toast.success("Home updated");
      } else {
        const h = await withRetry(() => homeApi.createHome(body));
        await selectedHome.set(h.id);
        toast.success(`${h.name} added`, "It's now the selected home in My Home.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDraft(null);
      homeHubSignal.bump();
      await load();
    } catch (e: any) {
      toast.error("Couldn't save this home", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (h: Home) => {
    try {
      await homeApi.updateHome(h.id, { name: h.name, address: h.address, kind: h.kind, color: h.color, is_default: true });
      Haptics.selectionAsync().catch(() => {});
      homeHubSignal.bump();
      await load();
    } catch (e: any) {
      toast.error("Couldn't change the default", e?.message);
    }
  };

  const confirm = (title: string, body: string, okLabel: string, go: () => void) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) go();
      return;
    }
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: okLabel, style: "destructive", onPress: go },
    ]);
  };

  const remove = (h: Home) => {
    const finish = async () => {
      const cur = await selectedHome.get();
      if (cur === h.id) await selectedHome.set(null);
      setDraft(null);
      toast.success(`${h.name} removed`);
      homeHubSignal.bump();
      await load();
    };
    const go = async (force: boolean) => {
      try {
        await homeApi.deleteHome(h.id, force);
        await finish();
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 409 && e.detail?.code === "HOME_NOT_EMPTY") {
          confirm("Delete everything in it too?", `${h.name} still has ${e.detail.count} saved thing${e.detail.count === 1 ? "" : "s"} — bills, records, items or repairs. They'll be deleted with it.`, "Delete all", () => go(true));
          return;
        }
        toast.error("Couldn't remove this home", e?.message ?? "Please try again.");
      }
    };
    confirm(`Remove ${h.name}?`, "You can add it again later. Nothing else in AMASS changes.", "Remove", () => go(false));
  };

  return (
    <Screen testID="homes-screen">
      <ScreenHeader title="Your homes" subtitle="Track up to 20 places" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home" as any))} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {error && !homes ? (
          <EmptyState variant="error" title="Couldn't load your homes" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="homes-error" />
        ) : !homes ? (
          <SkeletonRows rows={3} />
        ) : (
          <View style={{ gap: 10 }}>
            {homes.map((h) => (
              <View key={h.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`home-row-${h.id}`}>
                <Pressable onPress={() => openEdit(h)} accessibilityRole="button" accessibilityLabel={`${h.name}${h.is_default ? ", default" : ""}. Edit`} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.85 }]} testID={`home-edit-${h.id}`}>
                  <View style={[styles.dot, { backgroundColor: h.color }]}>
                    <Ionicons name={HOME_KIND_ICON[h.kind] ?? "home"} size={22} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <AppText variant="bodyMedium" numberOfLines={1}>
                      {h.name}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1}>
                      {[HOME_KINDS.find((k) => k.key === h.kind)?.label, h.address].filter(Boolean).join(" · ") || "No address yet"}
                    </AppText>
                  </View>
                </Pressable>
                {h.is_default ? (
                  <Badge label="Default" tone="success" size="xs" />
                ) : (
                  <Pressable onPress={() => makeDefault(h)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Make ${h.name} the default home`} style={[styles.defaultBtn, { borderColor: colors.border }]} testID={`home-default-${h.id}`}>
                    <AppText variant="micro" tone="secondary">
                      Set default
                    </AppText>
                  </Pressable>
                )}
                <Pressable onPress={() => openEdit(h)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${h.name}`}>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <AppText variant="micro" tone="tertiary" align="center">
          Each home keeps its own bills, records, items and repairs. Only you can see them.
        </AppText>
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Add a home" size="lg" fullWidth iconLeft="add" onPress={openNew} disabled={(homes?.length ?? 0) >= 20} testID="homes-add" />
      </View>

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit home" : "New home"} testID="home-form">
        {draft ? (
          <View style={{ gap: 16 }}>
            <Input label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="e.g. Lekki flat · Mum's house" error={tried && !draft.name.trim() ? "Give this home a name" : null} size="lg" autoFocus={!draft.id} testID="home-form-name" />
            <Field label="Type">
              <ChipRow options={HOME_KINDS.map((k) => ({ key: k.key as HomeKind, label: k.label, icon: HOME_KIND_ICON[k.key] }))} value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} testIDPrefix="home-kind" />
            </Field>
            <Input label="Address (optional)" value={draft.address} onChangeText={(address) => setDraft({ ...draft, address })} placeholder="Street, area, city" testID="home-form-address" />
            <Field label="Colour">
              <View style={styles.swatches}>
                {HOME_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setDraft({ ...draft, color: c })} accessibilityRole="button" accessibilityState={{ selected: draft.color === c }} accessibilityLabel={`Colour ${c}`} style={[styles.swatch, { backgroundColor: c }, draft.color === c && { borderWidth: 3, borderColor: colors.text }]} testID={`home-color-${c.replace("#", "").toLowerCase()}`}>
                    {draft.color === c ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                  </Pressable>
                ))}
              </View>
            </Field>
            {!draft.is_default ? <Chip label="Make this my default home" icon="star" selected={false} onPress={() => setDraft({ ...draft, is_default: true })} testID="home-form-default" /> : (
              <AppText variant="caption" tone="secondary">
                This is your default home — it opens first in My Home.
              </AppText>
            )}
            <Button label={draft.id ? "Save changes" : "Add home"} size="lg" fullWidth iconLeft="checkmark" loading={saving} onPress={save} testID="home-form-save" />
            {draft.id && homes && homes.length > 1 ? <Button label="Remove this home" variant="destructive" iconLeft="trash-outline" onPress={() => remove(homes.find((h) => h.id === draft.id)!)} testID="home-form-delete" /> : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space[4], paddingBottom: 120, gap: space[4] },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, minHeight: 68, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  dot: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  defaultBtn: { height: 32, paddingHorizontal: 10, borderRadius: radii.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space[4], paddingBottom: space[6] },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
