import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { AppText, Toggle } from "@/src/ui";

/** Switch with a visible label (the kit's Toggle only exposes the label to screen readers). */
export function ToggleRow({ value, onChange, label, caption, disabled, testID }: { value: boolean; onChange: (v: boolean) => void; label: string; caption?: string; disabled?: boolean; testID?: string }) {
  return (
    <View style={[styles.row, disabled && { opacity: 0.6 }]} testID={testID ? `${testID}-row` : undefined}>
      <Pressable onPress={() => !disabled && onChange(!value)} style={{ flex: 1, gap: 2 }} accessibilityLabel={label} disabled={disabled}>
        <AppText variant="bodySm" weight="bold">
          {label}
        </AppText>
        {caption ? (
          <AppText variant="micro" tone="tertiary">
            {caption}
          </AppText>
        ) : null}
      </Pressable>
      <Toggle value={value} onChange={onChange} label={label} disabled={disabled} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
});
