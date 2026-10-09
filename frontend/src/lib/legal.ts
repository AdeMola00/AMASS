import * as WebBrowser from "expo-web-browser";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

export const LEGAL_URLS = {
  privacy: `${BASE}/api/legal/privacy`,
  terms: `${BASE}/api/legal/terms`,
};

export async function openPrivacyPolicy() {
  await WebBrowser.openBrowserAsync(LEGAL_URLS.privacy);
}

export async function openTerms() {
  await WebBrowser.openBrowserAsync(LEGAL_URLS.terms);
}
