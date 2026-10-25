/**
 * Records — a private filing cabinet. Folder tiles with counts, search, and a list of files with thumbnails,
 * expiry pills and the bill / item / repair they're linked to.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { homeApi, homeHubSignal, type HomeRecord } from "@/src/lib/homeHub";
import { AppText, Badge, EmptyState, PressableScale, SkeletonRows } from "@/src/ui";
import { FOLDER_ICON, FileThumb, RECORD_FOLDERS, StatusPill, expiryPill, fmtDate, useSections } from "@/src/components/home/HomeBits";
import { ListShell } from "@/src/components/home/ListShell";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

export default function RecordsScreen() {
  const router = useRouter();
  const { colors, shadows, isDark } = useTheme();
  const sections = useSections();
  const params = useLocalSearchParams<{ folder?: string }>();
  const { homes, homeId, setHomeId, ready } = useSelectedHome({ allowAll: true });
  const [data, setData] = useState<{ items: HomeRecord[]; folders: Record<string, number> } | null>(null);
  const [folder, setFolder] = useState<string | null>(params.folder ?? null);
  const [q, setQ] = useState("");
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setData(await homeApi.records({ home_id: homeId }));
      setError(false);
    } catch {
      setError(true);
    }
  }, [ready, homeId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => homeHubSignal.subscribe(load), [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.items ?? []).filter((r) => (!folder || r.folder === folder) && (!needle || r.title.toLowerCase().includes(needle) || (r.notes ?? "").toLowerCase().includes(needle)));
  }, [data, folder, q]);
  const customFolders = Object.keys(data?.folders ?? {}).filter((k) => !RECORD_FOLDERS.some((f) => f.key === k));
  const folders = [...RECORD_FOLDERS, ...customFolders.map((k) => ({ key: k, label: k }))];
  const addTo = (f?: string | null) => router.push({ pathname: "/home/records/new", params: { home_id: homeId && homeId !== "all" ? homeId : "", folder: f ?? "" } } as any);

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[3] }}>
      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : "transparent" }, !isDark && shadows.sm]}>
        <Ionicons name="search" size={18} color={colors.text} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search receipts, agreements…" placeholderTextColor={colors.textTertiary} returnKeyType="search" autoCorrect={false} accessibilityLabel="Search records" testID="records-search" style={[styles.searchInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]} />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.folderGrid} testID="records-folders">
        {folders.map((f) => {
          const n = data?.folders[f.key] ?? 0;
          const sel = folder === f.key;
          return (
            <PressableScale key={f.key} onPress={() => setFolder(sel ? null : f.key)} scaleTo={0.95} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`${f.label}, ${n} file${n === 1 ? "" : "s"}`} style={[styles.folder, { backgroundColor: sel ? sections.records.color : colors.surface, borderColor: sel ? sections.records.color : colors.border }]} testID={`records-folder-${f.key}`}>
              <View style={[styles.folderIcon, { backgroundColor: sel ? "rgba(255,255,255,0.22)" : sections.records.soft }]}>
                <Ionicons name={FOLDER_ICON[f.key] ?? "folder"} size={22} color={sel ? "#FFFFFF" : sections.records.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="caption" color={sel ? "#FFFFFF" : colors.text} numberOfLines={1}>
                  {f.label}
                </AppText>
                <AppText variant="micro" color={sel ? "rgba(255,255,255,0.8)" : colors.textTertiary} tabular>
                  {n} file{n === 1 ? "" : "s"}
                </AppText>
              </View>
            </PressableScale>
          );
        })}
      </View>
      {folder ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppText variant="h3" style={{ flex: 1 }}>
            {folders.find((f) => f.key === folder)?.label}
          </AppText>
          <Pressable onPress={() => setFolder(null)} hitSlop={8} accessibilityRole="button" testID="records-clear-folder">
            <AppText variant="caption" tone="brand">
              Show all
            </AppText>
          </Pressable>
        </View>
      ) : (
        <AppText variant="h3">Recent</AppText>
      )}
    </View>
  );

  return (
    <ListShell meta={sections.records} subtitle="Private — only you can open these" homes={homes} homeId={homeId} onHome={setHomeId} onAdd={() => addTo(folder)} testID="records-screen">
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/home/records/${item.id}` as any)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${RECORD_FOLDERS.find((f) => f.key === item.folder)?.label ?? item.folder}`} style={({ pressed }) => [styles.row, { backgroundColor: colors.surface }, pressed && { opacity: 0.9 }]} testID={`record-row-${item.id}`}>
            <FileThumb file={item.file} size={56} radius={radii.md} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {item.title}
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Badge label={RECORD_FOLDERS.find((f) => f.key === item.folder)?.label ?? item.folder} tone="neutral" size="xs" icon={FOLDER_ICON[item.folder] ?? "folder"} />
                {item.bill_id ? <Badge label="Bill" tone="info" size="xs" icon="receipt" /> : null}
                {item.item_id ? <Badge label="Item" tone="info" size="xs" icon="cube" /> : null}
                {item.repair_id ? <Badge label="Repair" tone="info" size="xs" icon="hammer" /> : null}
                {item.expires_at ? <StatusPill {...expiryPill(item.expiry_status, item.days_until_expiry)} size="xs" /> : null}
              </View>
              <AppText variant="micro" tone="tertiary">
                Added {fmtDate(item.created_at, true)}
                {!item.file ? " · no file attached" : ""}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        ListEmptyComponent={
          !data && !error ? (
            <SkeletonRows rows={4} />
          ) : error ? (
            <EmptyState variant="error" title="Couldn't load records" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="records-error" />
          ) : q || folder ? (
            <EmptyState icon="folder-open-outline" title="Nothing here yet" body={folder ? `No files in ${folders.find((f) => f.key === folder)?.label.toLowerCase()} for this home.` : "No files match your search."} actionLabel={folder ? "Add one" : undefined} actionIcon="add" onAction={folder ? () => addTo(folder) : undefined} testID="records-empty-filter" />
          ) : (
            <EmptyState icon="folder-open-outline" title="Your filing cabinet is empty" body="Keep receipts, agreements, title documents and warranties in one private place — snap a photo or upload a PDF." actionLabel="Add a record" actionIcon="add" onAction={() => addTo(null)} testID="records-empty" />
          )
        }
      />
    </ListShell>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  folderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  folder: { width: "48.5%", flexDirection: "row", alignItems: "center", gap: 10, padding: 10, minHeight: 60, borderRadius: radii.lg, borderWidth: 1 },
  folderIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radii.lg, marginBottom: 8, minHeight: 72 },
});
