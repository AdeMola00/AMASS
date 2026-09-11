// Icon font loader for Expo apps. Fonts are loaded from a CDN only under
// Expo Go (StoreClient) — Metro's asset resolver on Android can return the
// autolinked .ttf files as 0 bytes there. Native dev/prod builds and web
// pass an empty map, so useFonts resolves to [true, null] immediately.
// Usage: const [loaded, error] = useIconFonts();

import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";

// Keep in sync with @react-native-vector-icons/ionicons in package.json.
// The library ships the .ttf inside its own npm package so jsdelivr can
// serve it directly.
const IONICONS_VERSION = "13.1.4";

const iconFontMap = (): Record<string, string> => ({
  Ionicons: `https://cdn.jsdelivr.net/npm/@react-native-vector-icons/ionicons@${IONICONS_VERSION}/fonts/Ionicons.ttf`,
});

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts(
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? iconFontMap()
      : {},
  );
