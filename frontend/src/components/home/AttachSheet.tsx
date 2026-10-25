/**
 * "Add a photo or file" sheet. Three big options; camera permission follows the contract — explain, ask once,
 * and when the OS won't ask again show an Open Settings button instead of a dead end.
 */
import React, { useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/src/theme";
import { AppText, Button, Sheet } from "@/src/ui";
import { pickDocument, pickPhoto, type PickOutcome } from "@/src/lib/homeFiles";
import { BigOption } from "./HomeBits";

export function AttachSheet({ visible, onClose, onPicked, title = "Add a photo or file", photosOnly }: { visible: boolean; onClose: () => void; onPicked: (o: Extract<PickOutcome, { ok: true }>) => void; title?: string; photosOnly?: boolean }) {
  const { colors } = useTheme();
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<PickOutcome>) => {
    setBusy(true);
    try {
      const out = await fn();
      if (out.ok) {
        onClose();
        onPicked(out);
      } else if (out.reason === "blocked") setBlocked(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID="attach-sheet">
      <View style={{ gap: 12 }}>
        <AppText variant="bodySm" tone="secondary">
          Photos are kept private to you and shrunk before upload so they save fast even on slow data.
        </AppText>
        <View style={styles.grid}>
          {Platform.OS !== "web" ? <BigOption icon="camera" label="Take photo" color={colors.brand} onPress={() => run(() => pickPhoto("camera"))} testID="attach-camera" /> : null}
          <BigOption icon="images" label="Photo library" color={colors.info} onPress={() => run(() => pickPhoto("library"))} testID="attach-library" />
          {!photosOnly ? <BigOption icon="document-text" label="Choose a file" caption="PDF or image" color={colors.declutter} onPress={() => run(pickDocument)} testID="attach-file" /> : null}
        </View>
        {blocked ? (
          <View style={[styles.blocked, { backgroundColor: colors.warningSoft }]} testID="attach-blocked">
            <AppText variant="bodySm" style={{ flex: 1 }}>
              Camera access is off for AMASS. Turn it on in Settings to take photos, or pick one from your library.
            </AppText>
            <Button label="Open Settings" size="sm" variant="secondary" onPress={() => Linking.openSettings()} testID="attach-open-settings" />
          </View>
        ) : null}
        {busy ? (
          <AppText variant="caption" tone="tertiary" align="center">
            Preparing…
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  blocked: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14 },
});
