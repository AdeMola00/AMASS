import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { storage } from "@/src/utils/storage";
import { AppTheme, darkTheme, lightTheme } from "./themes";

export type ThemeMode = "system" | "light" | "dark";
export type TextScale = "normal" | "large";
const THEME_MODE_KEY = "amass_theme_mode";
const TEXT_SCALE_KEY = "amass_text_scale";
/** "Larger text" mode multiplies every AppText size/line-height. */
export const TEXT_SCALE_FACTOR: Record<TextScale, number> = { normal: 1, large: 1.15 };

type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  textScale: TextScale;
  setTextScale: (s: TextScale) => void;
  /** True once the persisted preference has been read. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: "system",
  setMode: () => {},
  textScale: "normal",
  setTextScale: () => {},
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [textScale, setTextScaleState] = useState<TextScale>("normal");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([storage.getItem<string>(THEME_MODE_KEY, "system"), storage.getItem<string>(TEXT_SCALE_KEY, "normal")])
      .then(([v, t]) => {
        if (v === "light" || v === "dark" || v === "system") setModeState(v);
        if (t === "large" || t === "normal") setTextScaleState(t);
      })
      .finally(() => setReady(true));
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    storage.setItem(THEME_MODE_KEY, m).catch(() => {});
  }, []);
  const setTextScale = useCallback((s: TextScale) => {
    setTextScaleState(s);
    storage.setItem(TEXT_SCALE_KEY, s).catch(() => {});
  }, []);

  const resolved = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  const theme = resolved === "dark" ? darkTheme : lightTheme;

  const value = useMemo(() => ({ theme, mode, setMode, textScale, setTextScale, ready }), [theme, mode, setMode, textScale, setTextScale, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext).theme;
}

export function useThemeMode() {
  const { mode, setMode, theme } = useContext(ThemeContext);
  return { mode, setMode, isDark: theme.isDark };
}

/** Larger-text preference (Settings → Appearance). Returns the multiplier AppText applies. */
export function useTextScale() {
  const { textScale, setTextScale } = useContext(ThemeContext);
  return { textScale, setTextScale, factor: TEXT_SCALE_FACTOR[textScale] };
}
