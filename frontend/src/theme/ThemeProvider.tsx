import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { storage } from "@/src/utils/storage";
import { AppTheme, darkTheme, lightTheme } from "./themes";

export type ThemeMode = "system" | "light" | "dark";
const THEME_MODE_KEY = "amass_theme_mode";

type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** True once the persisted preference has been read. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: "system",
  setMode: () => {},
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage
      .getItem<string>(THEME_MODE_KEY, "system")
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setModeState(v);
      })
      .finally(() => setReady(true));
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    storage.setItem(THEME_MODE_KEY, m).catch(() => {});
  }, []);

  const resolved = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  const theme = resolved === "dark" ? darkTheme : lightTheme;

  const value = useMemo(() => ({ theme, mode, setMode, ready }), [theme, mode, setMode, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext).theme;
}

export function useThemeMode() {
  const { mode, setMode, theme } = useContext(ThemeContext);
  return { mode, setMode, isDark: theme.isDark };
}
