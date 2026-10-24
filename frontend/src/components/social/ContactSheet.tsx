/**
 * ContactSheet — the ONLY way a viewer reaches a poster. Always opened by the viewer tapping
 * "Message"; nothing is sent until they choose a message. Channels appear only when the poster
 * enabled them (chat · WhatsApp · call). Numbers are fetched on tap, never embedded in the post.
 */
import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, SocialPost } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Avatar, Button, Input, Sheet, SheetLink, useToast } from "@/src/ui";
import { socialFont } from "./socialTheme";

export function ContactSheet({ visible, onClose, post, quickMessages }: { visible: boolean; onClose: () => void; post: SocialPost; quickMessages: string[] }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const sendChat = async (message: string) => {
    if (busy) return;
    setBusy("chat");
    try {
      const r = await api.socialContact(post.id, "chat", message.trim());
      track("social_contact", { post_id: post.id, channel: "chat" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
      setText("");
      router.push(`/chat/${r.conversation_id}` as any);
    } catch (e: any) {
      toast.error("Couldn't start the chat", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const openChannel = async (channel: "whatsapp" | "phone") => {
    if (busy) return;
    setBusy(channel);
    try {
      const r = await api.socialContact(post.id, channel);
      track("social_contact", { post_id: post.id, channel });
      if (r.url) await Linking.openURL(r.url);
      onClose();
    } catch (e: any) {
      toast.error(channel === "whatsapp" ? "Couldn't open WhatsApp" : "Couldn't start the call", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const first = post.author.full_name.split(" ")[0];
  return (
    <Sheet visible={visible} onClose={onClose} title={`Contact ${first}`} testID="social-contact-sheet">
      <View style={[styles.poster, { backgroundColor: colors.surfaceAlt }]}>
        <Avatar name={post.author.full_name} uri={post.author.avatar_url} size={40} verified={post.author.verified} />
        <View style={{ flex: 1 }}>
          <AppText style={{ fontFamily: socialFont.bold, fontSize: 15, lineHeight: 19 }} numberOfLines={1}>
            {post.author.full_name}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            About “{post.title}”
          </AppText>
        </View>
      </View>

      {post.contact.chat ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <AppText variant="caption" tone="secondary" style={{ fontFamily: socialFont.semibold }}>
            Send a message in AMASS
          </AppText>
          {quickMessages.map((q, i) => (
            <Pressable key={q} onPress={() => sendChat(q)} disabled={!!busy} style={[styles.quick, { backgroundColor: colors.brandSoft }]} accessibilityRole="button" accessibilityLabel={`Send: ${q}`} testID={`social-quick-${i}`}>
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.brand} />
              <AppText variant="bodySm" color={colors.brandText} style={{ flex: 1, fontFamily: socialFont.semibold }}>
                {q}
              </AppText>
              <Ionicons name="send" size={14} color={colors.brand} />
            </Pressable>
          ))}
          <Input value={text} onChangeText={setText} placeholder="Or write your own…" multiline containerStyle={{ marginTop: 4, marginBottom: 0 }} testID="social-contact-text" />
          <Button label="Send message" variant="brand" size="lg" fullWidth iconLeft="send" disabled={text.trim().length < 2} loading={busy === "chat"} onPress={() => sendChat(text)} testID="social-contact-send" />
        </View>
      ) : null}

      {post.contact.whatsapp || post.contact.phone ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <AppText variant="caption" tone="secondary" style={{ fontFamily: socialFont.semibold }}>
            {first} also accepts
          </AppText>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {post.contact.whatsapp ? <Button label="WhatsApp" variant="secondary" size="md" iconLeft="logo-whatsapp" style={{ flex: 1 }} loading={busy === "whatsapp"} onPress={() => openChannel("whatsapp")} testID="social-contact-whatsapp" /> : null}
            {post.contact.phone ? <Button label="Call" variant="secondary" size="md" iconLeft="call-outline" style={{ flex: 1 }} loading={busy === "phone"} onPress={() => openChannel("phone")} testID="social-contact-phone" /> : null}
          </View>
        </View>
      ) : null}

      <View style={[styles.safety, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
        <AppText variant="micro" tone="secondary" style={{ flex: 1 }}>
          Meet in a public spot or at the estate gate, check the item before paying, and never send money in advance.
        </AppText>
      </View>
      <SheetLink label="not now" onPress={onClose} testID="social-contact-cancel" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  poster: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.lg },
  quick: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  safety: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.md, marginTop: 14 },
});
