/**
 * AMASS Push — Emergent-managed device registration (SuprSend relay).
 *
 * Two entry points, deliberately separate so we never nag:
 *   • registerForPush(userId)   — SILENT. Only re-registers the native token
 *     when the OS permission is already granted (tokens rotate). Called on
 *     login / session restore. Never shows a permission prompt.
 *   • requestPushPermission(userId, context) — the ONE place the native
 *     prompt is shown. Called only from contextual value moments (saving a
 *     search, following a brand, first social request, the preference toggle).
 *
 * Push only fires in a real build (dev-client / TestFlight / APK) — never in
 * Expo Go or the web preview.
 */
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/src/lib/api";

export type PushPermission = { status: "granted" | "denied" | "undetermined"; canAskAgain: boolean; supported: boolean };

let _lastRegisteredUser: string | null = null;

export const pushSupported = Platform.OS !== "web" && !!Device.isDevice;

export async function getPushPermission(): Promise<PushPermission> {
  if (!pushSupported) return { status: "undetermined", canAskAgain: false, supported: false };
  try {
    const p = await Notifications.getPermissionsAsync();
    return { status: p.status === "granted" ? "granted" : p.status === "denied" ? "denied" : "undetermined", canAskAgain: p.canAskAgain !== false, supported: true };
  } catch {
    return { status: "undetermined", canAskAgain: false, supported: false };
  }
}

async function uploadToken(userId: string): Promise<boolean> {
  const tokenResp = await Notifications.getDevicePushTokenAsync();
  const token = tokenResp?.data;
  if (!token) return false;
  await api.registerPush({ user_id: userId, platform: Platform.OS === "ios" ? "ios" : "android", device_token: String(token) });
  _lastRegisteredUser = userId;
  AsyncStorage.setItem("amass_pushOptedIn", "1").catch(() => {});
  return true;
}

/** Silent token refresh — only when permission is ALREADY granted. */
export async function registerForPush(userId: string): Promise<boolean> {
  if (!pushSupported) return false;
  if (_lastRegisteredUser === userId) return true;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return false;
    const ok = await uploadToken(userId);
    if (ok) api.notifPushPrompt("granted", "session").catch(() => {});
    return ok;
  } catch {
    return false;
  }
}

/** Shows the native prompt (contextual) and registers on success. */
export async function requestPushPermission(userId: string, context: string): Promise<"granted" | "denied" | "blocked" | "unsupported"> {
  if (!pushSupported) return "unsupported";
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    let canAskAgain = existing.canAskAgain !== false;
    if (status !== "granted" && canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
      canAskAgain = req.canAskAgain !== false;
    }
    if (status === "granted") {
      _lastRegisteredUser = null;
      await uploadToken(userId);
      await api.notifPushPrompt("granted", context).catch(() => {});
      return "granted";
    }
    const outcome = canAskAgain ? "denied" : "blocked";
    await api.notifPushPrompt(outcome, context).catch(() => {});
    return outcome;
  } catch {
    return "denied";
  }
}

export function resetPushRegistration(): void {
  _lastRegisteredUser = null;
}
