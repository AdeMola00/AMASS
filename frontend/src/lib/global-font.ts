// Applies Plus Jakarta Sans app-wide by injecting a weight-matched fontFamily
// into every <Text> that doesn't already specify a custom font. This keeps the
// whole app on one clean, readable typeface without editing hundreds of styles.
//
// Safe by design:
//   • Modifies the INPUT props.style (a normal RN style array) BEFORE calling
//     the original render — never mutates an already-rendered host element,
//     so it works on both native and react-native-web.
//   • Only runs if the component exposes a patchable forwardRef `render`.
//   • Skips any Text that already sets an explicit `fontFamily` (icon fonts,
//     the serif price stack, and the Market screen's own PJS styles).
//   • Wrapped in try/catch so it can never crash rendering.
import { Text, TextInput, StyleSheet } from "react-native";
import { fontFamily } from "@/src/constants/theme";

function weightToFamily(weight?: string | number): string {
  // Weight is capped at 500 app-wide — hierarchy comes from size/tracking.
  if (weight === "bold") return fontFamily.medium;
  const n = typeof weight === "string" ? parseInt(weight, 10) : weight;
  if (!n || Number.isNaN(n) || n <= 400) return fontFamily.regular;
  return fontFamily.medium;
}

function patch(Component: any) {
  if (!Component || Component.__pjsPatched || typeof Component.render !== "function") return;
  const originalRender = Component.render;
  Component.render = function (props: any, ref: any) {
    try {
      const flat = (StyleSheet.flatten(props && props.style) || {}) as any;
      if (!flat.fontFamily) {
        const family = weightToFamily(flat.fontWeight);
        props = { ...props, style: [{ fontFamily: family }, props && props.style] };
      }
    } catch {}
    return originalRender.call(this, props, ref);
  };
  Component.__pjsPatched = true;
}

patch(Text as any);
patch(TextInput as any);
