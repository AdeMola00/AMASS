import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { EstatePost } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, type BadgeTone } from "@/src/ui";

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = 60_000, h = 60 * m, d = 24 * h;
  if (diff < m) return "just now";
  if (diff < h) return `${Math.round(diff / m)}m`;
  if (diff < d) return `${Math.round(diff / h)}h`;
  if (diff < 7 * d) return `${Math.round(diff / d)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const POST_TYPE: Record<EstatePost["type"], { label: string; tone: BadgeTone; icon: any }> = {
  notice: { label: "Official notice", tone: "brand", icon: "megaphone" },
  question: { label: "Question", tone: "info", icon: "help-circle" },
  recommendation: { label: "Recommendation", tone: "success", icon: "thumbs-up" },
  general: { label: "Neighbour post", tone: "neutral", icon: "chatbubble" },
};

/** Compact post row. Official management posts are visibly labelled and framed differently from resident posts. */
export function PostRow({ post, onPress, testID }: { post: EstatePost; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const t = POST_TYPE[post.type] ?? POST_TYPE.general;
  const official = post.is_official;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: official ? colors.brandSoft : colors.surface, borderColor: official ? colors.brand : colors.border }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${t.label}: ${post.title || post.body}`} testID={testID ?? `post-row-${post.id}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {official ? (
          <View style={[styles.officialIcon, { backgroundColor: colors.brand }]}>
            <Ionicons name="shield-checkmark" size={14} color="#fff" />
          </View>
        ) : (
          <Avatar name={post.author?.full_name} uri={post.author?.avatar_url} size={28} tone="soft" />
        )}
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {official ? "Estate management" : post.author?.full_name || "Neighbour"}
          {post.estate_name ? ` · ${post.estate_name}` : ""} · {timeAgo(post.created_at)}
        </AppText>
        <Badge label={official ? "Official" : t.label} tone={official ? "brand" : t.tone} size="xs" icon={t.icon} />
      </View>
      {post.title ? (
        <AppText variant="bodyMedium" numberOfLines={2}>
          {post.title}
        </AppText>
      ) : null}
      <AppText variant="bodySm" tone={post.title ? "secondary" : "primary"} numberOfLines={post.title ? 2 : 3}>
        {post.body}
      </AppText>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Meta icon={post.type === "question" ? "chatbubble-ellipses-outline" : "return-down-forward-outline"} text={post.type === "question" ? (post.answers_count ? `${post.answers_count} answer${post.answers_count === 1 ? "" : "s"}` : "No answers yet — be first") : `${post.answers_count} repl${post.answers_count === 1 ? "y" : "ies"}`} />
        {post.upvote_count ? <Meta icon="arrow-up-outline" text={`${post.upvote_count}`} /> : null}
        {post.accepted_reply_id ? <Badge label="Answered" tone="success" size="xs" icon="checkmark-circle" /> : null}
        {post.pinned ? <Ionicons name="pin" size={13} color={colors.textTertiary} /> : null}
      </View>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons name={icon} size={13} color={colors.textTertiary} />
      <AppText variant="micro" tone="tertiary" tabular>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  officialIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
