/**
 * AMASS Push — device registration helper (Emergent-managed).
 *
 * Called from AuthProvider after login and on every app open (tokens rotate).
 * Never blocks the auth flow: if permissions denied or backend errors, we
 * silently no-op and let the app carry on.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { api } from "@/src/lib/api";

let _lastRegisteredUser: string | null = null;

export async function registerForPush(userId: string): Promise<boolean> {
  // Web has no meaningful native push; skip.
  if (Platform.OS === "web") return false;
  // Push tokens are only issued on real devices, not on simulators.
  if (!Device.isDevice) return false;
  // Avoid re-registering redundantly within the same session.
  if (_lastRegisteredUser === userId) return true;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted" && existing.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return false;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = tokenResp?.data;
    if (!token) return false;

    await api.registerPush({
      user_id: userId,
      platform: Platform.OS === "ios" ? "ios" : "android",
      device_token: String(token),
    });
    _lastRegisteredUser = userId;
    return true;
  } catch {
    return false;
  }
}

export function resetPushRegistration() {
  _lastRegisteredUser = null;
}
