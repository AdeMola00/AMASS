import React, { useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { fontFamilies, radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Screen, ScreenHeader, Skeleton } from "@/src/ui";
import { AmassPinIcon } from "@/src/components/AmassLogo";

type Msg = { id: string; role: "user" | "ai"; text: string; filters?: any };

const SUGGESTIONS: { icon: "home" | "map" | "trending-up" | "git-compare"; text: string }[] = [
  { icon: "home", text: "Show me a duplex under ₦150M in Lekki" },
  { icon: "map", text: "Find verified land around Abeokuta" },
  { icon: "trending-up", text: "Which areas have the highest rental yield?" },
  { icon: "git-compare", text: "Compare Ikoyi with Victoria Island" },
];

export default function AiSearch() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
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
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);

    try {
      // Fire chat + filter parse in parallel for a snappy dual-answer.
      const [res, parsed] = await Promise.all([
        api.aiSearchSync(text.trim(), sessionId),
        api.aiParseSearch(text.trim()).catch(() => ({ ok: false }) as any),
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

  const filterTags = (f: any): string[] => {
    const tags: string[] = [];
    if (f.listing_type) tags.push(String(f.listing_type));
    if (f.property_type) tags.push(String(f.property_type));
    if (f.bedrooms) tags.push(`${f.bedrooms}+ beds`);
    if (f.city) tags.push(String(f.city));
    if (f.max_price) tags.push(`≤ ₦${(f.max_price / 1_000_000).toFixed(0)}M`);
    if (f.verified) tags.push("Verified");
    return tags;
  };

  return (
    <Screen testID="ai-search-screen">
      <ScreenHeader
        title="AMASS AI"
        subtitle="Property assistant"
        backTestID="ai-back"
        right={
          <View style={[styles.aiIcon, { backgroundColor: colors.brand }]}>
            <Ionicons name="sparkles" size={16} color={colors.onBrand} />
          </View>
        }
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, padding: space[4], paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {msgs.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(260)} style={styles.welcome}>
            <View style={[styles.welcomeIcon, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.sm]}>
              <AmassPinIcon size={40} />
            </View>
            <AppText variant="h2" align="center" style={{ maxWidth: 300, marginTop: 8 }}>
              Ask me anything about African real estate
            </AppText>
            <AppText variant="bodySm" tone="tertiary" align="center" style={{ maxWidth: 300 }}>
              I can find properties, compare neighbourhoods and analyse investment yields — then apply the results to your map.
            </AppText>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s, i) => (
                <Animated.View key={s.text} entering={FadeInDown.delay(80 + i * 50).duration(240)}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.suggestion,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      shadows.xs,
                      pressed && { backgroundColor: colors.surfaceAlt },
                    ]}
                    onPress={() => send(s.text)}
                    accessibilityRole="button"
                    testID={`suggestion-${s.text.substring(0, 10)}`}
                  >
                    <View style={[styles.suggestionIcon, { backgroundColor: colors.brandSoft }]}>
                      <Ionicons name={s.icon} size={15} color={colors.brand} />
                    </View>
                    <AppText variant="bodyMedium" style={{ flex: 1 }}>
                      {s.text}
                    </AppText>
                    <Ionicons name="arrow-up-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        ) : (
          <View style={{ gap: 12 }}>
            {msgs.map((m) => {
              const isUser = m.role === "user";
              const tags = m.filters ? filterTags(m.filters) : [];
              return (
                <Animated.View key={m.id} entering={FadeInUp.duration(220)} style={[styles.row, isUser ? styles.rowUser : styles.rowAi]}>
                  {!isUser ? (
                    <View style={[styles.aiAvatar, { backgroundColor: colors.brand }]}>
                      <Ionicons name="sparkles" size={12} color={colors.onBrand} />
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.bubble,
                      isUser
                        ? { backgroundColor: colors.surfaceInverse, borderBottomRightRadius: 6 }
                        : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 6 },
                    ]}
                    accessibilityLabel={`${isUser ? "You" : "AMASS AI"}: ${m.text}`}
                  >
                    <AppText variant="body" color={isUser ? colors.textInverse : colors.text}>
                      {m.text}
                    </AppText>
                    {tags.length > 0 ? (
                      <View style={[styles.filterPreview, { borderTopColor: colors.divider }]}>
                        <View style={styles.tagRow}>
                          {tags.map((t) => (
                            <Badge key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} tone="neutral" size="sm" />
                          ))}
                        </View>
                        <Button
                          label="Apply to map"
                          variant="brand"
                          size="sm"
                          iconLeft="map"
                          onPress={() =>
                            router.replace({
                              pathname: "/(tabs)",
                              params: { ai_filters: JSON.stringify(m.filters) },
                            } as any)
                          }
                          testID="ai-apply-filters"
                        />
                      </View>
                    ) : null}
                  </View>
                </Animated.View>
              );
            })}
            {thinking ? (
              <Animated.View entering={FadeInUp.duration(220)} style={[styles.row, styles.rowAi]}>
                <View style={[styles.aiAvatar, { backgroundColor: colors.brand }]}>
                  <Ionicons name="sparkles" size={12} color={colors.onBrand} />
                </View>
                <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 6, gap: 8, minWidth: 180 }]} testID="ai-thinking">
                  <Skeleton height={12} width="85%" />
                  <Skeleton height={12} width="60%" />
                  <AppText variant="caption" tone="tertiary">
                    Thinking…
                  </AppText>
                </View>
              </Animated.View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <KeyboardStickyView offset={{ opened: 8, closed: 0 }}>
        <View style={[styles.inputBar, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask AMASS AI…"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text }]}
              multiline
              maxLength={500}
              accessibilityLabel="Message AMASS AI"
              testID="ai-input"
              onSubmitEditing={() => send(input)}
            />
            <Pressable
              style={[styles.sendBtn, { backgroundColor: colors.brand }, (!input.trim() || thinking) && { opacity: 0.4 }]}
              onPress={() => send(input)}
              disabled={!input.trim() || thinking}
              accessibilityRole="button"
              accessibilityLabel="Send"
              testID="ai-send-btn"
            >
              <Ionicons name="arrow-up" size={18} color={colors.onBrand} />
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  aiIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  welcome: { alignItems: "center", paddingTop: 32, gap: 10 },
  welcomeIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  suggestions: { gap: 10, marginTop: space[5], width: "100%" },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  suggestionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowUser: { justifyContent: "flex-end" },
  rowAi: { justifyContent: "flex-start" },
  aiAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.lg },
  filterPreview: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  inputBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space[4], paddingTop: 10 },
  inputWrap: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, padding: 6, paddingLeft: 16, minHeight: 52 },
  input: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fontFamilies.regular, maxHeight: 110, paddingVertical: 10 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
