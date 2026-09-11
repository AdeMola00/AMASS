/**
 * AMASS — web-safe wrapper around `expo-media-library`.
 *
 * expo-media-library ≥57 hard-imports its native "Next" module at the top of
 * the module, which crashes RN-Web with "Cannot find native module
 * 'ExpoMediaLibraryNext'". This wrapper lazy-imports the package only on
 * native platforms so the web bundle stays clean, and exposes the two APIs
 * the app actually uses.
 *
 * Web callers get graceful no-ops instead of a crash.
 */
import { Platform } from "react-native";

type PermResult = {
  granted: boolean;
  canAskAgain: boolean;
  status: "granted" | "denied" | "undetermined";
};

let _mod: any = null;
function _load() {
  if (Platform.OS === "web") return null;
  if (_mod) return _mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _mod = require("expo-media-library");
    return _mod;
  } catch {
    return null;
  }
}

export async function requestPermissionsAsync(): Promise<PermResult> {
  const m = _load();
  if (!m) return { granted: false, canAskAgain: false, status: "denied" };
  return m.requestPermissionsAsync();
}

export async function getPermissionsAsync(): Promise<PermResult> {
  const m = _load();
  if (!m) return { granted: false, canAskAgain: false, status: "denied" };
  return m.getPermissionsAsync();
}

export async function saveToLibraryAsync(localUri: string): Promise<void> {
  const m = _load();
  if (!m) throw new Error("Saving to Photos is only available on the app.");
  return m.saveToLibraryAsync(localUri);
}

export async function createAssetAsync(localUri: string): Promise<any> {
  const m = _load();
  if (!m) throw new Error("Saving to Photos is only available on the app.");
  return m.createAssetAsync(localUri);
}
