import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";
import { AmassPinIcon } from "@/src/components/AmassLogo";

type Msg = { id: string; role: "user" | "ai"; text: string; filters?: any };

const SUGGESTIONS = [
  "Show me a duplex under ₦150M in Lekki",
  "Find verified land around Abeokuta",
  "Which areas have the highest rental yield?",
  "Compare Ikoyi with Victoria Island",
];

function FilterTag({ label }: { label: string }) {
  return (
    <View style={styles.filterTag}>
      <Text style={styles.filterTagText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function AiSearch() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const sessionId = useRef(`session-${Date.now()}`).current;
  const scrollRef = useRef<ScrollView>(null);

  const send = async (text: string) => {
    if (!text.trim() || thinking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", text: text.trim() };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    setThinking(true);

    try {
      // Fire chat + filter parse in parallel for a snappy dual-answer.
      const [res, parsed] = await Promise.all([
        api.aiSearchSync(text.trim(), sessionId),
        api.aiParseSearch(text.trim()).catch(() => ({ ok: false } as any)),
      ]);
      const filters = parsed?.ok ? parsed.filters : undefined;
      setMsgs((m) => [...m, { id: `a-${Date.now()}`, role: "ai", text: res.reply, filters }]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "ai",
          text: "Sorry, I couldn't reach the AI service just now. Please try again.",
        },
      ]);
    } finally {
      setThinking(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="ai-search-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12} testID="ai-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.title}>
          <View style={styles.aiIcon}>
            <Ionicons name="sparkles" size={16} color="#fff" />
          </View>
          <Text style={styles.h2}>AMASS AI</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {msgs.length === 0 ? (
          <View style={styles.welcome}>
            <AmassPinIcon size={44} />
            <Text style={styles.welcomeTitle}>Ask me anything about African real estate.</Text>
            <Text style={styles.welcomeSub}>
              I can help you find properties, compare neighborhoods, and analyse investment yields.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.suggestion, shadows.soft]}
                  onPress={() => send(s)}
                  testID={`suggestion-${s.substring(0, 10)}`}
                >
                  <Ionicons name="arrow-up-outline" size={14} color={colors.emerald} />
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.chat}>
            {msgs.map((m) => (
              <View
                key={m.id}
                style={[
                  styles.bubbleRow,
                  m.role === "user" ? styles.userRow : styles.aiRow,
                ]}
              >
                {m.role === "ai" && (
                  <View style={styles.aiAvatar}>
                    <Ionicons name="sparkles" size={12} color="#fff" />
                  </View>
                )}
                <View
                  style={[
                    styles.bubble,
                    m.role === "user" ? styles.bubbleUser : styles.bubbleAi,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      m.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAi,
                    ]}
                  >
                    {m.text}
                  </Text>
                  {m.filters && Object.keys(m.filters).length > 0 && (
                    <View style={styles.filterPreview}>
                      <View style={styles.filterChipsRow}>
                        {m.filters.listing_type && (
                          <FilterTag label={m.filters.listing_type} />
                        )}
                        {m.filters.property_type && (
                          <FilterTag label={m.filters.property_type} />
                        )}
                        {m.filters.bedrooms && (
                          <FilterTag label={`${m.filters.bedrooms}+ beds`} />
                        )}
                        {m.filters.city && <FilterTag label={m.filters.city} />}
                        {m.filters.max_price && (
                          <FilterTag label={`≤ ₦${(m.filters.max_price / 1_000_000).toFixed(0)}M`} />
                        )}
                        {m.filters.verified && <FilterTag label="Verified" />}
                      </View>
                      <Pressable
                        style={styles.applyFiltersBtn}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          router.replace({
                            pathname: "/(tabs)",
                            params: { ai_filters: JSON.stringify(m.filters) },
                          } as any);
                        }}
                        testID="ai-apply-filters"
                      >
                        <Ionicons name="map" size={14} color="#fff" />
                        <Text style={styles.applyFiltersText}>Apply to map</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            ))}
            {thinking && (
              <View style={[styles.bubbleRow, styles.aiRow]}>
                <View style={styles.aiAvatar}>
                  <Ionicons name="sparkles" size={12} color="#fff" />
                </View>
                <View style={[styles.bubble, styles.bubbleAi, { flexDirection: "row", gap: 8 }]}>
                  <ActivityIndicator size="small" color={colors.emerald} />
                  <Text style={[styles.bubbleTextAi, { color: colors.textTertiary }]}>Thinking…</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <KeyboardStickyView offset={{ opened: 8, closed: 0 }}>
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.inputWrap}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask AMASS AI…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              maxLength={500}
              testID="ai-input"
            />
            <Pressable
              style={[
                styles.sendBtn,
                (!input.trim() || thinking) && { opacity: 0.4 },
              ]}
              onPress={() => send(input)}
              disabled={!input.trim() || thinking}
              testID="ai-send-btn"
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  filterPreview: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    gap: 8,
  },
  filterChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#0A0A0A",
  },
  filterTagText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
    textTransform: "capitalize",
  },
  applyFiltersBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.red,
    alignSelf: "flex-start",
  },
  applyFiltersText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  h2: { ...typography.h2, fontSize: 18 },
  scroll: { flexGrow: 1, padding: spacing.xl, paddingBottom: 20 },
  welcome: { alignItems: "center", paddingTop: 40, gap: 12 },
  welcomeTitle: {
    ...typography.h2,
    textAlign: "center",
    maxWidth: 300,
    marginTop: 12,
  },
  welcomeSub: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 22,
  },
  suggestions: { gap: 10, marginTop: spacing.xl, width: "100%" },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  suggestionText: { ...typography.body, color: colors.text, flex: 1 },
  chat: { gap: spacing.md },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  userRow: { justifyContent: "flex-end" },
  aiRow: { justifyContent: "flex-start" },
  aiAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 20,
  },
  bubbleUser: { backgroundColor: colors.ink, borderBottomRightRadius: 6 },
  bubbleAi: { backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextUser: { color: "#fff" },
  bubbleTextAi: { color: colors.text },
  inputBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: "#fff",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 24,
    padding: 6,
    paddingLeft: spacing.lg,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
});
