import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/src/auth";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton } from "@/src/ui";
import { storage } from "@/src/utils/storage";

export const DRAFTS = {
  listing: { key: "draft_listing", href: "/listing/new", label: "draft_listing", icon: "home" },
  item: { key: "draft_item", href: "/item/new", label: "draft_item", icon: "pricetag" },
} as const;

type Saved<T> = { data: T; at: number };

async function readDraft<T>(key: string): Promise<Saved<T> | null> {
  const raw = await storage.getItem<string | null>(key, null);
  if (!raw) return null;
  try {
    return JSON.parse(raw as string);
  } catch {
    return null;
  }
}

// One draft per signed-in person, so a shared phone never shows someone else's work.
function useDraftKey(base: string) {
  const { me } = useAuth();
  return `${base}_${me?.user?.id || "anon"}`;
}

// Keeps a wizard's answers on the phone (works with no signal) until it is published or cleared.
export function useDraft<T extends object>(base: string, data: T, apply: (d: T) => void, isEmpty: (d: T) => boolean) {
  const key = useDraftKey(base);
  // Ready only once the draft for the *current* user key has been read.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const ready = loadedKey === key;
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const fns = useRef({ apply, isEmpty });
  useEffect(() => {
    fns.current = { apply, isEmpty };
  });
  const done = useRef(false);

  useEffect(() => {
    readDraft<T>(key).then((d) => {
      if (d?.data) {
        fns.current.apply(d.data);
        setRestoredAt(d.at);
      }
      setLoadedKey(key);
    });
  }, [key]);

  const json = JSON.stringify(data);
  useEffect(() => {
    if (!ready || done.current) return;
    if (fns.current.isEmpty(data)) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ data, at: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, json, key]);

  // After publishing: stop saving and forget the draft.
  const finish = useCallback(() => {
    done.current = true;
    return storage.removeItem(key);
  }, [key]);
  const dismiss = useCallback(() => setRestoredAt(null), []);
  return { ready, restoredAt, finish, dismiss };
}

export function savedTime(at: number) {
  try {
    return new Date(at).toLocaleString("en-NG", { weekday: "short", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function DraftBanner({ at, onStartOver }: { at: number; onStartOver: () => void }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  return (
    <View testID="draft-banner" style={{ gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.brandTertiary }}>
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
        <Ionicons name="phone-portrait" size={30} color={colors.onBrandTertiary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.onBrandTertiary }}>{t("draft_back")}</Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.onBrandTertiary }}>{t("draft_saved", { time: savedTime(at) })}</Text>
        </View>
      </View>
      <BigButton label={t("start_over")} icon="refresh" tone="neutral" outline onPress={onStartOver} testID="draft-start-over" />
    </View>
  );
}

// Home screen reminder: "You have an unfinished listing — tap to continue".
export function DraftNotice({ kind }: { kind: keyof typeof DRAFTS }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const router = useRouter();
  const d = DRAFTS[kind];
  const key = useDraftKey(d.key);
  const [at, setAt] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      readDraft(key).then((x) => setAt(x?.at ?? null));
    }, [key]),
  );
  if (!at) return null;
  return (
    <Pressable
      testID={`draft-notice-${kind}`}
      onPress={() => router.push(d.href)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, minHeight: 72, borderRadius: radius.lg, borderWidth: 2, borderStyle: "dashed", borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary, opacity: pressed ? 0.8 : 1 })}
    >
      <Ionicons name={d.icon} size={30} color={colors.brandPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 17, color: colors.onSurface }}>{t(d.label)}</Text>
        <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.muted }}>
          {t("continue_draft")} · {savedTime(at)}
        </Text>
      </View>
      <Ionicons name="arrow-forward-circle" size={36} color={colors.brandPrimary} />
    </Pressable>
  );
}
