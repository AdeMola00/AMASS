import React from "react";
import { Pressable, StyleSheet, View, ViewStyle, Animated, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Svg, { Path, Rect, Line, Circle } from "react-native-svg";
import { useTheme } from "@/src/theme";
import { motion, radii, space } from "@/src/theme/tokens";
import { AppText } from "./Text";
import type { IconName } from "./icons";
import { useReducedMotion } from "./Feedback";

/* ─── Stepper ──────────────────────────────────────────────────────────
   Horizontal progress for multi-step flows (onboarding, KYC, checkout).
   Status is conveyed by icon + label, never colour alone.                */
export type StepStatus = "done" | "current" | "upcoming" | "error";
export function Stepper({
  steps,
  style,
  testID,
}: {
  steps: { label: string; status: StepStatus; caption?: string }[];
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stepper, style]} testID={testID} accessibilityRole="progressbar" accessibilityLabel={`Step ${Math.max(1, steps.findIndex((s) => s.status === "current") + 1)} of ${steps.length}`}>
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const fill =
          s.status === "done" ? colors.success : s.status === "current" ? colors.primary : s.status === "error" ? colors.error : colors.surfaceSunken;
        const fg = s.status === "upcoming" ? colors.textTertiary : s.status === "current" ? colors.onPrimary : "#fff";
        const icon: IconName | null = s.status === "done" ? "checkmark" : s.status === "error" ? "alert" : null;
        return (
          <View key={s.label} style={[styles.stepCol, !isLast && { flex: 1 }]}>
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, { backgroundColor: fill, borderColor: s.status === "upcoming" ? colors.border : fill }]} accessibilityLabel={`${s.label}: ${s.status}`}>
                {icon ? <Ionicons name={icon} size={13} color={fg} /> : <AppText variant="micro" color={fg} tabular>{i + 1}</AppText>}
              </View>
              {!isLast ? <View style={[styles.stepLine, { backgroundColor: s.status === "done" ? colors.success : colors.border }]} /> : null}
            </View>
            <AppText variant="micro" tone={s.status === "current" ? "primary" : "tertiary"} weight={s.status === "current" ? "extrabold" : "semibold"} numberOfLines={1} style={{ marginTop: 6 }}>
              {s.label}
            </AppText>
            {s.caption ? (
              <AppText variant="micro" tone="muted" numberOfLines={1}>
                {s.caption}
              </AppText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ─── Tabs (underline) ───────────────────────────────────────────────── */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  style,
  testID,
}: {
  tabs: { key: T; label: string; badge?: number }[];
  value: T;
  onChange: (k: T) => void;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tabs, { borderBottomColor: colors.border }, style]} accessibilityRole="tablist" testID={testID}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${t.label}${t.badge ? `, ${t.badge}` : ""}`}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
            testID={testID ? `${testID}-${t.key}` : undefined}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText variant="bodyMedium" weight={active ? "bold" : "medium"} tone={active ? "primary" : "tertiary"}>
                {t.label}
              </AppText>
              {t.badge ? (
                <View style={[styles.tabBadge, { backgroundColor: active ? colors.primary : colors.surfaceAlt }]}>
                  <AppText variant="micro" color={active ? colors.onPrimary : colors.textSecondary} tabular>
                    {t.badge}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View style={[styles.tabUnderline, { backgroundColor: active ? colors.primary : "transparent" }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/* ─── Toggle (switch) ─────────────────────────────────────────────────── */
export function Toggle({
  value,
  onChange,
  label,
  disabled,
  testID,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const x = React.useRef(new Animated.Value(value ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: reduce ? 0 : motion.fast, useNativeDriver: Platform.OS !== "web" }).start();
  }, [value, x, reduce]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      hitSlop={8}
      disabled={disabled}
      style={[styles.toggle, { backgroundColor: value ? colors.success : colors.surfaceSunken, opacity: disabled ? 0.5 : 1 }]}
      testID={testID}
    >
      <Animated.View style={[styles.knob, { transform: [{ translateX }] }]}>
        {value ? <Ionicons name="checkmark" size={12} color={colors.success} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/* ─── Charts (SVG, dependency-free) ───────────────────────────────────── */
export function BarChart({
  data,
  height = 120,
  color,
  style,
  formatValue = (n: number) => n.toLocaleString(),
  testID,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  style?: ViewStyle;
  formatValue?: (n: number) => string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [w, setW] = React.useState(0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const barColor = color ?? colors.primary;
  const gap = 6;
  const n = Math.max(1, data.length);
  const bw = w > 0 ? (w - gap * (n - 1)) / n : 0;
  const summary = data.map((d) => `${d.label} ${formatValue(d.value)}`).join(", ");
  return (
    <View style={style} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel={`Bar chart: ${summary}`} testID={testID}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={0} y1={height - 18} x2={w} y2={height - 18} stroke={colors.border} strokeWidth={1} />
          {data.map((d, i) => {
            const h = Math.max(2, ((height - 24) * d.value) / max);
            return <Rect key={d.label + i} x={i * (bw + gap)} y={height - 18 - h} width={bw} height={h} rx={4} fill={d.value === max ? barColor : colors.borderStrong} />;
          })}
        </Svg>
      ) : null}
      <View style={styles.axis}>
        {data.map((d, i) => (
          <AppText key={d.label + i} variant="micro" tone="tertiary" numberOfLines={1} style={{ width: bw, textAlign: "center" }}>
            {d.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

export function Sparkline({
  values,
  height = 40,
  color,
  style,
  testID,
}: {
  values: number[];
  height?: number;
  color?: string;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [w, setW] = React.useState(0);
  const stroke = color ?? colors.success;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * w : w / 2;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <View style={[{ height }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel={`Trend: ${values.join(", ")}`} testID={testID}>
      {w > 0 && values.length > 0 ? (
        <Svg width={w} height={height}>
          <Path d={d} stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {last ? <Circle cx={last[0]} cy={last[1]} r={3.5} fill={stroke} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "flex-start" },
  stepCol: { minWidth: 56 },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  stepLine: { flex: 1, height: 2, marginHorizontal: 6, borderRadius: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { paddingHorizontal: space[3], paddingTop: space[2], minHeight: 44, justifyContent: "flex-end", gap: 8 },
  tabUnderline: { height: 2.5, borderRadius: 2 },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  toggle: { width: 46, height: 26, borderRadius: radii.pill, justifyContent: "center" },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  axis: { flexDirection: "row", justifyContent: "space-between", gap: 6, marginTop: -14 },
});
