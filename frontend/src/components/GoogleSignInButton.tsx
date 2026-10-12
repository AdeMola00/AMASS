/**
 * AMASS — Continue with Google (Emergent-managed).
 *
 * Opens the Emergent hosted OAuth page, catches the one-time `session_id`
 * on redirect, and hands it to our backend bridge `/api/auth/google-session`
 * which returns the same {access_token, user} shape as email/password login.
 *
 * Works on: iOS, Android, Expo Go, and the web preview.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform, Pressable, StyleSheet, Text, View, ActivityIndicator, Alert,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { storage } from "@/src/utils/storage";
import { AUTH_STORAGE_KEY, api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radius } from "@/src/constants/theme";

WebBrowser.maybeCompleteAuthSession();

const EMERGENT_AUTH_URL = "https://auth.emergentagent.com/";

// Regex that matches session_id in either the query OR the hash fragment
// (Emergent returns it in the fragment: `myapp://#session_id=...`).
const SESSION_RE = /[?#&]session_id=([^&#]+)/;

function extractSessionId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(SESSION_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

export function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const router = useRouter();
  const theme = useTheme();
  const { refresh } = useAuth() as any;  // refresh is optional; fallback below
  const [busy, setBusy] = useState(false);
  const consumedRef = useRef<Set<string>>(new Set());
  const linkListenerRef = useRef<{ remove: () => void } | null>(null);
  const capturedUrlRef = useRef<string | null>(null);

  // Web: parse session_id on mount from URL, exchange with backend
  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      const sid =
        extractSessionId(typeof window !== "undefined" ? window.location.hash : "") ||
        extractSessionId(typeof window !== "undefined" ? window.location.search : "");
      if (!sid || consumedRef.current.has(sid)) return;
      consumedRef.current.add(sid);
      exchange(sid).finally(() => {
        try {
          // Strip session_id from URL, preserve the rest
          if (typeof window !== "undefined") {
            const cleanHash = window.location.hash.replace(SESSION_RE, "").replace(/^#/, "");
            const cleanSearch = window.location.search.replace(SESSION_RE, "").replace(/^\?/, "");
            const newUrl =
              window.location.pathname +
              (cleanSearch ? `?${cleanSearch}` : "") +
              (cleanHash ? `#${cleanHash}` : "");
            window.history.replaceState(window.history.state, "", newUrl);
          }
        } catch {}
      });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exchange = useCallback(
    async (sessionId: string) => {
      setBusy(true);
      try {
        const res = await api.googleSession(sessionId);
        await storage.secureSet(AUTH_STORAGE_KEY, res.access_token);
        // Refresh AuthContext by calling /me → set user
        try {
          if (typeof refresh === "function") await refresh();
        } catch {}
        router.replace("/(tabs)");
      } catch (e: any) {
        const msg = e?.message ?? "Google sign-in failed";
        if (onError) onError(msg);
        else Alert.alert("Sign-in failed", msg);
      } finally {
        setBusy(false);
      }
    },
    [refresh, router, onError]
  );

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      let redirectUrl: string;
      if (Platform.OS === "web") {
        redirectUrl = window.location.origin + "/";
      } else {
        redirectUrl = Linking.createURL("");
      }
      const authUrl = `${EMERGENT_AUTH_URL}?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === "web") {
        // Full-page nav; we'll pick session_id up in the useEffect above.
        window.location.href = authUrl;
        return;  // browser navigates away; nothing more to do
      }

      // ── Native: capture deep-link URL from three sources ──
      capturedUrlRef.current = null;
      const sub = Linking.addEventListener("url", ({ url }) => {
        if (extractSessionId(url)) capturedUrlRef.current = url;
      });
      linkListenerRef.current = sub;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let candidate: string | null = null;
      if (result.type === "success" && (result as any).url) {
        candidate = (result as any).url;
      }
      if (!candidate) candidate = capturedUrlRef.current;
      if (!candidate) candidate = await Linking.getInitialURL();

      // Cleanup listener
      try { sub.remove(); } catch {}
      linkListenerRef.current = null;

      const sid = extractSessionId(candidate);
      if (!sid) {
        // User cancelled or opaque failure. Silent unless we can tell it errored.
        if (result.type === "cancel") return;
        return;
      }
      if (consumedRef.current.has(sid)) return;
      consumedRef.current.add(sid);
      await exchange(sid);
    } catch (e: any) {
      const msg = e?.message ?? "Couldn't open Google sign-in";
      if (onError) onError(msg);
      else Alert.alert("Sign-in failed", msg);
    } finally {
      setBusy(false);
    }
  }, [busy, exchange, onError]);

  useEffect(() => () => {
    try { linkListenerRef.current?.remove(); } catch {}
  }, []);

  return (
    <Pressable
      onPress={start}
      style={[styles.btn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }, busy && { opacity: 0.7 }]}
      disabled={busy}
      testID="google-signin"
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <View style={styles.row}>
          <GoogleGlyph />
          <Text style={[styles.label, { color: theme.colors.text }]}>Continue with Google</Text>
        </View>
      )}
    </Pressable>
  );
}

function GoogleGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.7 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 8 3l5.7-5.7C33.6 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3 0 5.8 1.1 8 3l5.7-5.7C33.6 6.1 29.1 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
      <Path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5.1l-6-5.1c-2 1.5-4.6 2.4-7 2.4-5.1 0-9.5-3.2-11.2-7.8l-6.5 5C9.4 39.5 16.1 44 24 44z"/>
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6 5.1C41.4 34.7 44 29.7 44 24c0-1.2-.1-2.4-.4-3.5z"/>
    </Svg>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
});
