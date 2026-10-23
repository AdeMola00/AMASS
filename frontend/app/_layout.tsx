import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Alert, LogBox, Platform, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useAppFonts } from "@/src/hooks/use-app-fonts";
import "@/src/lib/global-font";
import { AuthProvider } from "@/src/contexts/auth";
import { CartProvider } from "@/src/contexts/cart";
import { ShopBasketProvider } from "@/src/contexts/shopBasket";
import { WalletProvider } from "@/src/contexts/wallet";
import { PushPromptProvider } from "@/src/contexts/pushPrompt";
import { ThemeProvider, useTheme } from "@/src/theme";
import { ToastProvider } from "@/src/ui/Toast";
import { OfflineBanner } from "@/src/ui/OfflineBanner";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// ─── Push (Emergent-managed) — module scope so the channel exists before any push arrives ───
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "AMASS",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#E11B22",
  }).catch(() => {});
}

function openPushUrl(router: ReturnType<typeof useRouter>, data: any) {
  const url = data?.deeplink || data?.action_url;
  if (!url || typeof url !== "string") return;
  try {
    if (url.startsWith("http")) Linking.openURL(url);
    else router.push(url as any);
  } catch {}
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [appFontsLoaded, appFontsError] = useAppFonts();
  const loaded = iconsLoaded && appFontsLoaded;
  const error = iconsError || appFontsError;
  const router = useRouter();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // ─── Push tap handlers (warm + cold start) and the weekly "blocked" nudge ───
  useEffect(() => {
    if (Platform.OS === "web") return;
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openPushUrl(router, response.notification.request.content.data);
    });
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) openPushUrl(router, response.notification.request.content.data);
      })
      .catch(() => {});
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        // Only nudge people who previously opted in (push_enabled) — never cold users.
        const optedIn = await AsyncStorage.getItem("amass_pushOptedIn");
        if (optedIn !== "1") return;
        const lastNudge = await AsyncStorage.getItem("amass_pushNudgeAt");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
        const stamp = () => AsyncStorage.setItem("amass_pushNudgeAt", String(Date.now())).catch(() => {});
        Alert.alert("Phone alerts are blocked", "You turned on AMASS alerts, but they're blocked in your phone settings.", [
          { text: "Later", style: "cancel", onPress: stamp },
          {
            text: "Open Settings",
            onPress: () => {
              stamp();
              Linking.openSettings();
            },
          },
        ]);
      } catch {}
    })();
    return () => {
      tapSub.remove();
    };
  }, [router]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <BottomSheetModalProvider>
              <AuthProvider>
                <WalletProvider>
                  <CartProvider>
                    <ShopBasketProvider>
                      <ToastProvider>
                        <PushPromptProvider>
                          <ThemedStack />
                        </PushPromptProvider>
                      </ToastProvider>
                    </ShopBasketProvider>
                  </CartProvider>
                </WalletProvider>
              </AuthProvider>
            </BottomSheetModalProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStack() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.bg} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade",
        }}
      />
      <OfflineBanner />
    </>
  );
}
