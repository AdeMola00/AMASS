/**
 * AMASS Push — DISABLED.
 *
 * The expo-notifications package has been removed from this project so the
 * Android build can succeed. This file now exports no-op stubs so any existing
 * imports keep type-checking, but nothing is registered or sent.
 *
 * To re-enable push, add expo-notifications back to package.json/app.json and
 * restore the original implementation from git history.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function registerForPush(_userId: string): Promise<boolean> {
  return false;
}

export function resetPushRegistration(): void {
  /* no-op */
}
