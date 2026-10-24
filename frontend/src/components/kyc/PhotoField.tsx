/**
 * Photo field for KYC uploads — identity documents, selfies and title documents.
 * Shows a preview once picked; "Take photo" follows the camera permission contract
 * (contextual ask → one retry → Open Settings), "Choose photo" uses the system picker.
 */
import React, { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Button, PressableScale, useToast, type IconName } from "@/src/ui";
import { authedImageSource, pickImageDataUrl } from "@/src/lib/pickImage";

export function PhotoField({
  label,
  hint,
  icon = "image-outline",
  value,
  onChange,
  preferCamera,
  readOnly,
  height = 150,
  testID,
}: {
  label: string;
  hint?: string;
  icon?: IconName;
  /** Local data URL (just picked) or a protected `/api/files/...` URL (already submitted). */
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
  /** Selfies: lead with the camera; documents: lead with the gallery. */
  preferCamera?: boolean;
  readOnly?: boolean;
  height?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState<"camera" | "library" | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [authed, setAuthed] = useState<{ for: string; src: { uri: string; headers?: Record<string, string> } } | null>(null);
  const needsAuth = !!value && !value.startsWith("data:");

  useEffect(() => {
    if (!needsAuth || !value) return;
    let alive = true;
    authedImageSource(value).then((s) => alive && setAuthed({ for: value, src: s }));
    return () => {
      alive = false;
    };
  }, [needsAuth, value]);

  const src = !value ? null : value.startsWith("data:") ? { uri: value } : authed?.for === value ? authed.src : null;

  const pick = async (source: "camera" | "library") => {
    if (busy) return;
    setBusy(source);
    try {
      const res = await pickImageDataUrl(source);
      if (res.ok) {
        setBlocked(false);
        onChange?.(res.dataUrl);
      } else if (res.reason === "blocked") {
        setBlocked(true);
      } else if (res.reason === "denied") {
        toast.info("Camera access needed", "Allow the camera to take the photo, or choose one from your gallery.");
      } else if (res.reason === "failed") {
        toast.error("Couldn't read that photo", "Please try another one.");
      }
    } finally {
      setBusy(null);
    }
  };

  const camLabel = preferCamera ? "Take selfie" : "Take photo";
  return (
    <View style={{ gap: 10 }} testID={testID}>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{label}</AppText>
        {hint ? (
          <AppText variant="caption" tone="secondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.box, { height, backgroundColor: colors.surfaceAlt, borderColor: value ? colors.success : colors.borderStrong, borderStyle: value ? "solid" : "dashed" }]}>
        {src ? (
          <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} testID={testID ? `${testID}-preview` : undefined} />
        ) : (
          <View style={styles.center}>
            <Ionicons name={icon} size={30} color={colors.textTertiary} />
            <AppText variant="caption" tone="tertiary">
              {readOnly ? "No photo" : "No photo yet"}
            </AppText>
          </View>
        )}
        {value && !readOnly ? (
          <PressableScale onPress={() => onChange?.(null)} scaleTo={0.9} style={[styles.remove, { backgroundColor: "rgba(17,17,17,0.65)" }]} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} testID={testID ? `${testID}-remove` : undefined}>
            <Ionicons name="close" size={16} color="#fff" />
          </PressableScale>
        ) : null}
        {value ? (
          <View style={[styles.ok, { backgroundColor: colors.success }]} pointerEvents="none">
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        ) : null}
      </View>
      {!readOnly ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {Platform.OS !== "web" ? (
            <Button label={value ? `Re-${camLabel.toLowerCase()}` : camLabel} variant={preferCamera ? "primary" : "secondary"} size="sm" iconLeft="camera-outline" loading={busy === "camera"} disabled={!!busy} onPress={() => pick("camera")} style={{ flex: 1 }} testID={testID ? `${testID}-camera` : undefined} />
          ) : null}
          <Button label={value ? "Choose another" : "Choose photo"} variant={preferCamera && Platform.OS !== "web" ? "secondary" : "primary"} size="sm" iconLeft="images-outline" loading={busy === "library"} disabled={!!busy} onPress={() => pick("library")} style={{ flex: 1 }} testID={testID ? `${testID}-library` : undefined} />
        </View>
      ) : null}
      {blocked ? (
        <View style={[styles.blocked, { backgroundColor: colors.warningSoft }]} testID={testID ? `${testID}-blocked` : undefined}>
          <Ionicons name="camera-outline" size={18} color={colors.warning} />
          <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
            Camera access is turned off for AMASS. Turn it on in Settings, or choose a photo from your gallery.
          </AppText>
          <Button label="Open Settings" size="xs" variant="outline" onPress={() => Linking.openSettings()} testID={testID ? `${testID}-settings` : undefined} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.lg, borderWidth: 1.5, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", gap: 6 },
  remove: { position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ok: { position: "absolute", left: 8, bottom: 8, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  blocked: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
});
