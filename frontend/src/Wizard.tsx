import Ionicons from "@react-native-vector-icons/ionicons";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TKey } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, space, useTheme } from "@/src/theme";
import { BigButton, ScreenHeader, StepBar } from "@/src/ui";

// One question per screen, big Back / Next at the bottom.
export function Wizard({
  title,
  step,
  total,
  question,
  guide,
  children,
  onBack,
  onNext,
  nextLabel,
  nextIcon = "arrow-forward",
  canNext = true,
  busy,
}: {
  title: string;
  step: number;
  total: number;
  question: string;
  guide: TKey;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextIcon?: any;
  canNext?: boolean;
  busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useSettings();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={title} guide={guide} extra={question} back />
      <KeyboardAwareScrollView bottomOffset={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 + insets.bottom }}>
        <StepBar n={step} total={total} />
        <Animated.View key={step} entering={FadeInRight.duration(250)} style={{ gap: space.lg }}>
          <Text testID="wizard-question" style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.onSurface }}>
            {question}
          </Text>
          {children}
        </Animated.View>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={{ flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: insets.bottom + space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          {step > 1 ? (
            <View style={{ flex: 1 }}>
              <BigButton label={t("back")} icon="arrow-back" tone="neutral" outline onPress={onBack} testID="wizard-back-button" />
            </View>
          ) : null}
          <View style={{ flex: 2 }}>
            <BigButton label={nextLabel || t("next")} icon={nextIcon} onPress={onNext} disabled={!canNext} loading={busy} testID="wizard-next-button" />
          </View>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

export function OptionGrid<K extends string>({ options, value, onChange, testPrefix }: { options: { key: K; label: string; icon: any }[]; value: K | null; onChange: (k: K) => void; testPrefix: string }) {
  const { colors } = useTheme();
  const { speakText } = useSettings();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testPrefix}-${o.key}`}
            onPress={() => onChange(o.key)}
            onLongPress={() => speakText(o.label)}
            style={{ width: "47%", flexGrow: 1, minHeight: 120, borderRadius: 24, borderWidth: 3, borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandSecondary : colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.md }}
          >
            <Ionicons name={o.icon} size={42} color={on ? colors.brandPrimary : colors.onSurface} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 17, textAlign: "center", color: on ? colors.brandPrimary : colors.onSurface }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BigInput(props: any) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[{ minHeight: 68, borderRadius: 14, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, paddingHorizontal: space.lg, fontFamily: props.money ? fonts.display : fonts.medium, fontSize: props.money ? 32 : 19, color: colors.onSurface }, props.style]}
    />
  );
}

export function ReviewRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 }}>
      <Ionicons name={icon} size={26} color={colors.brandPrimary} />
      <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted, width: 100 }}>{label}</Text>
      <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface }}>{value}</Text>
    </View>
  );
}
