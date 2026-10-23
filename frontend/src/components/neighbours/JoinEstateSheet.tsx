/**
 * Join an estate — join code (from management) or a request with optional proof of residence.
 * Proof and unit number are private: only estate managers can open them, and they're deleted on review.
 */
import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, Estate } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { pickAndUploadImage } from "@/src/lib/pickImage";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Button, Input, SegmentedControl, Sheet, useToast } from "@/src/ui";
import { AuthedImage } from "./AuthedImage";

type Mode = "code" | "request";

export function JoinEstateSheet({ visible, onClose, estate, onJoined }: { visible: boolean; onClose: () => void; estate: Estate; onJoined: (status: string) => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(estate.verification_methods?.includes("join_code") ? "code" : "request");
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadImage();
      if (url) setProof(url);
    } catch (e: any) {
      toast.error("Couldn't upload", e?.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.estateJoin(estate.id, mode === "code" ? { join_code: code.trim(), unit: unit.trim() || undefined } : { proof_url: proof ?? undefined, unit: unit.trim() || undefined, note: note.trim() || undefined });
      track("estate_request", { method: mode });
      toast.success(r.status === "approved" ? `Welcome to ${estate.name}` : "Request sent", r.message);
      onJoined(r.status);
      onClose();
    } catch (e: any) {
      toast.error("Couldn't join", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={`Join ${estate.name}`} testID="join-estate-sheet">
      <View style={{ gap: 12 }}>
        <SegmentedControl options={[{ value: "code" as Mode, label: "I have a join code" }, { value: "request" as Mode, label: "Request to join" }]} value={mode} onChange={setMode} testIDPrefix="join-mode" />
        {mode === "code" ? (
          <>
            <AppText variant="caption" tone="secondary">
              Estate management shares a short code with residents (notice board, WhatsApp group, or the estate office).
            </AppText>
            <Input value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="e.g. 7F3A2C" autoCapitalize="characters" autoCorrect={false} maxLength={24} iconLeft="key-outline" testID="join-code-input" />
          </>
        ) : (
          <>
            <AppText variant="caption" tone="secondary">
              Management verifies you manually. Adding a photo of a utility bill, tenancy agreement or estate ID speeds this up — only managers can see it, and it’s deleted after review.
            </AppText>
            <View style={[styles.proofBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {proof ? <AuthedImage url={proof} style={styles.proofImg} /> : <Ionicons name="document-attach-outline" size={22} color={colors.textTertiary} />}
              <View style={{ flex: 1 }}>
                <AppText variant="bodySm" weight="bold">
                  {proof ? "Proof attached" : "Proof of residence (optional)"}
                </AppText>
                <AppText variant="micro" tone="tertiary">
                  Private · managers only
                </AppText>
              </View>
              <Button label={proof ? "Replace" : "Add photo"} size="xs" variant="secondary" loading={uploading} onPress={upload} testID="join-proof-btn" />
            </View>
            <Input value={note} onChangeText={setNote} placeholder="Note to management (optional)" maxLength={200} testID="join-note-input" />
          </>
        )}
        <Input value={unit} onChangeText={setUnit} placeholder="House / flat number (private, optional)" maxLength={40} iconLeft="home-outline" testID="join-unit-input" />
        <Button label={mode === "code" ? "Join with code" : "Send request"} size="lg" fullWidth disabled={mode === "code" && code.trim().length < 4} loading={busy} onPress={submit} testID="join-submit" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  proofBox: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md, borderWidth: 1 },
  proofImg: { width: 44, height: 44, borderRadius: 8 },
});
