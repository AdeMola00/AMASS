/**
 * Compose an estate post. Residents: question · recommendation · general.
 * Managers additionally: official notice (clearly labelled, notifies residents).
 */
import React, { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { api, EstateGroup, EstatePost } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { AppText, Button, Chip, Input, Sheet, useToast } from "@/src/ui";
import { ToggleRow } from "@/src/components/neighbours/ToggleRow";

type PostType = EstatePost["type"];

export function ComposePostSheet({ visible, onClose, estateId, isManager, groups = [], defaultType = "question", groupId, onCreated }: { visible: boolean; onClose: () => void; estateId: string; isManager: boolean; groups?: EstateGroup[]; defaultType?: PostType; groupId?: string | null; onCreated: (p: EstatePost) => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [type, setType] = useState<PostType>(defaultType);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [group, setGroup] = useState<string | null>(groupId ?? null);
  const [newHere, setNewHere] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setType(defaultType);
      setGroup(groupId ?? null);
    }
  }, [visible, defaultType, groupId]);

  const types: { k: PostType; label: string; icon: any; hint: string }[] = [
    { k: "question", label: "Question", icon: "help-circle-outline", hint: "Ask neighbours — e.g. a reliable plumber, school run tips, water schedule." },
    { k: "recommendation", label: "Recommend", icon: "thumbs-up-outline", hint: "Share a place or service you'd trust a neighbour with." },
    { k: "general", label: "Say hello", icon: "chatbubble-outline", hint: "Introduce yourself or share something useful. No selling — use Declutter for that." },
    ...(isManager ? [{ k: "notice" as PostType, label: "Official notice", icon: "megaphone-outline", hint: "Posted as estate management. Every resident is notified." }] : []),
  ];
  const cur = types.find((t) => t.k === type) ?? types[0];
  const canSend = body.trim().length >= 2 && (type !== "notice" || title.trim().length >= 3);

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const p = await api.estatePostCreate(estateId, { type, title: title.trim() || undefined, body: body.trim(), group_id: group ?? undefined, tags: newHere && type === "general" ? ["new-here"] : [], official: type === "notice" });
      toast.success(type === "question" ? "Question posted" : type === "notice" ? "Notice sent to residents" : "Posted");
      setTitle("");
      setBody("");
      setNewHere(false);
      onCreated(p);
      onClose();
    } catch (e: any) {
      toast.error("Couldn't post", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="New post" testID="compose-sheet">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {types.map((t) => (
            <Chip key={t.k} label={t.label} icon={t.icon} selected={type === t.k} onPress={() => setType(t.k)} tone={t.k === "notice" ? "brand" : "default"} testID={`compose-type-${t.k}`} />
          ))}
        </ScrollView>
        <AppText variant="caption" tone="secondary">
          {cur.hint}
        </AppText>
        {groups.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="Whole estate" selected={group === null} onPress={() => setGroup(null)} />
            {groups.filter((g) => g.joined).map((g) => (
              <Chip key={g.id} label={`${g.emoji ?? ""} ${g.name}`.trim()} selected={group === g.id} onPress={() => setGroup(g.id)} testID={`compose-group-${g.id}`} />
            ))}
          </ScrollView>
        ) : null}
        <Input value={title} onChangeText={setTitle} placeholder={type === "question" ? "Question in one line (optional)" : type === "notice" ? "Notice title" : "Title (optional)"} maxLength={120} testID="compose-title" />
        <Input value={body} onChangeText={setBody} placeholder={type === "question" ? "Add details so neighbours can help…" : "What would you like to share?"} multiline numberOfLines={5} maxLength={2000} style={{ minHeight: 110, textAlignVertical: "top" }} testID="compose-body" />
        {type === "general" ? <ToggleRow value={newHere} onChange={setNewHere} label="I'm new here — say hi" testID="compose-new-here" /> : null}
        <AppText variant="micro" tone="tertiary">
          Your exact address and phone are never shown. Posts are visible to verified residents only.
        </AppText>
        <Button label={type === "notice" ? "Send official notice" : "Post"} variant={type === "notice" ? "brand" : "primary"} size="lg" fullWidth disabled={!canSend} loading={busy} onPress={submit} testID="compose-submit" />
        <View style={{ height: 4, backgroundColor: colors.bg }} />
      </ScrollView>
    </Sheet>
  );
}

