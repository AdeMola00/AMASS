/**
 * Month grid + date field. One grid serves the Calendar screen (status dots per day) and the date picker
 * sheet used by every form. Cells are ≥ 44 pt and read "Today" / "Selected" to screen readers.
 */
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import dayjs from "dayjs";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Chip, Sheet, type IconName } from "@/src/ui";
import type { DueStatus } from "@/src/lib/homeHub";
import { useStatusMeta } from "./HomeBits";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function MonthGrid({ month, selected, onSelect, marks, today, testID }: { month: string; selected?: string | null; onSelect: (d: string) => void; marks?: Record<string, DueStatus[]>; today?: string; testID?: string }) {
  const { colors } = useTheme();
  const statusMeta = useStatusMeta();
  const t = today ?? dayjs().format("YYYY-MM-DD");
  const cells = useMemo(() => {
    const first = dayjs(`${month}-01`);
    const lead = (first.day() + 6) % 7; // Monday-first
    const days = first.daysInMonth();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) out.push(first.date(d).format("YYYY-MM-DD"));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);
  const rank: Record<string, number> = { overdue: 0, due_soon: 1, upcoming: 2, paid: 3, done: 3 };

  return (
    <View testID={testID}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <AppText key={w} variant="micro" tone="tertiary" align="center" style={styles.cell}>
            {w}
          </AppText>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        <View key={r} style={styles.weekRow}>
          {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.cell} />;
            const isToday = d === t;
            const isSel = d === selected;
            const dots = (marks?.[d] ?? []).slice().sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9)).slice(0, 3);
            return (
              <Pressable
                key={d}
                onPress={() => onSelect(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${dayjs(d).format("dddd D MMMM")}${isToday ? ", today" : ""}${dots.length ? `, ${dots.length} item${dots.length === 1 ? "" : "s"}` : ""}`}
                style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}
                testID={`cal-day-${d}`}
              >
                <View style={[styles.dayDisc, isSel && { backgroundColor: colors.primary }, !isSel && isToday && { borderWidth: 2, borderColor: colors.brand }]}>
                  <AppText variant="bodyMedium" color={isSel ? colors.onPrimary : isToday ? colors.brand : colors.text} tabular>
                    {dayjs(d).date()}
                  </AppText>
                </View>
                <View style={styles.dots}>
                  {dots.map((s, k) => (
                    <View key={k} style={[styles.dot, { backgroundColor: statusMeta(s).color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function MonthNav({ month, onChange, testID }: { month: string; onChange: (m: string) => void; testID?: string }) {
  const { colors } = useTheme();
  const m = dayjs(`${month}-01`);
  return (
    <View style={styles.nav} testID={testID}>
      <Pressable onPress={() => onChange(m.subtract(1, "month").format("YYYY-MM"))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous month" style={[styles.navBtn, { backgroundColor: colors.surfaceAlt }]} testID="cal-prev">
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>
      <AppText variant="h3" align="center" style={{ flex: 1 }} testID="cal-month-label">
        {m.format("MMMM YYYY")}
      </AppText>
      <Pressable onPress={() => onChange(m.add(1, "month").format("YYYY-MM"))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next month" style={[styles.navBtn, { backgroundColor: colors.surfaceAlt }]} testID="cal-next">
        <Ionicons name="chevron-forward" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

/* ─── Date picker sheet + field ─────────────────────────────────────────── */
export function DatePickerSheet({ visible, value, onClose, onChange, title = "Pick a date", allowClear, quick = "future" }: { visible: boolean; value: string | null; onClose: () => void; onChange: (d: string | null) => void; title?: string; allowClear?: boolean; quick?: "future" | "past" | "none" }) {
  const today = dayjs().format("YYYY-MM-DD");
  const [month, setMonth] = useState((value ?? today).slice(0, 7));
  const pick = (d: string | null) => {
    onChange(d);
    onClose();
  };
  const quicks =
    quick === "future"
      ? [
          { label: "Today", d: today },
          { label: "Tomorrow", d: dayjs().add(1, "day").format("YYYY-MM-DD") },
          { label: "In a week", d: dayjs().add(7, "day").format("YYYY-MM-DD") },
          { label: "Month end", d: dayjs().endOf("month").format("YYYY-MM-DD") },
          { label: "In a year", d: dayjs().add(1, "year").format("YYYY-MM-DD") },
        ]
      : quick === "past"
        ? [
            { label: "Today", d: today },
            { label: "Yesterday", d: dayjs().subtract(1, "day").format("YYYY-MM-DD") },
            { label: "Last week", d: dayjs().subtract(7, "day").format("YYYY-MM-DD") },
            { label: "Last month", d: dayjs().subtract(1, "month").format("YYYY-MM-DD") },
          ]
        : [];
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID="date-sheet">
      <View style={{ gap: 14 }}>
        {quicks.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {quicks.map((q) => (
              <Chip key={q.label} label={q.label} selected={value === q.d} onPress={() => pick(q.d)} testID={`date-quick-${q.label.toLowerCase().replace(/\s+/g, "-")}`} />
            ))}
            {allowClear && value ? <Chip label="Clear" icon="close" onPress={() => pick(null)} testID="date-clear" /> : null}
          </View>
        ) : null}
        <MonthNav month={month} onChange={setMonth} />
        <MonthGrid month={month} selected={value} onSelect={pick} />
      </View>
    </Sheet>
  );
}

export function DateField({ label, value, onChange, placeholder = "Pick a date", icon = "calendar", allowClear, quick, helper, testID }: { label: string; value: string | null; onChange: (d: string | null) => void; placeholder?: string; icon?: IconName; allowClear?: boolean; quick?: "future" | "past" | "none"; helper?: string; testID?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const text = value ? dayjs(value).format("ddd D MMM YYYY") : null;
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" tone="secondary" uppercase>
        {label}
      </AppText>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${text ?? "not set"}. Pick a date`} style={({ pressed }) => [styles.field, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.85 }]} testID={testID}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
        <AppText variant="body" color={text ? colors.text : colors.textTertiary} style={{ flex: 1 }} numberOfLines={1}>
          {text ?? placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {helper ? (
        <AppText variant="micro" tone="tertiary">
          {helper}
        </AppText>
      ) : null}
      <DatePickerSheet visible={open} value={value} onClose={() => setOpen(false)} onChange={onChange} title={label} allowClear={allowClear} quick={quick} />
    </View>
  );
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: "row" },
  cell: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "flex-start", paddingVertical: 2 },
  dayDisc: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 3, height: 8, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  nav: { flexDirection: "row", alignItems: "center", gap: 8 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  field: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: radii.md, borderWidth: 1 },
});
