import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, Platform, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
// Push notifications disabled — expo-notifications removed for Android build.
// import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useAppFonts } from "@/src/hooks/use-app-fonts";
import "@/src/lib/global-font";
import { AuthProvider } from "@/src/contexts/auth";
import { CartProvider } from "@/src/contexts/cart";
import { WalletProvider } from "@/src/contexts/wallet";
import { ThemeProvider, useTheme } from "@/src/theme";
import { ToastProvider } from "@/src/ui/Toast";
import { OfflineBanner } from "@/src/ui/OfflineBanner";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// ─── Push notifications DISABLED — expo-notifications removed for Android build ───
// if (Platform.OS !== "web") {
//   Notifications.setNotificationHandler({
//     handleNotification: async () => ({
//       shouldShowAlert: true,
//       shouldPlaySound: true,
//       shouldSetBadge: true,
//       shouldShowBanner: true,
//       shouldShowList: true,
//     }),
//   });
// }
//
// if (Platform.OS === "android") {
//   Notifications.setNotificationChannelAsync("default", {
//     name: "AMASS",
//     importance: Notifications.AndroidImportance.MAX,
//     sound: "default",
//     vibrationPattern: [0, 250, 250, 250],
//     lightColor: "#E11D48",
//   }).catch(() => {});
// }

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

  // ─── Push tap handlers DISABLED — expo-notifications removed ───
  // useEffect(() => {
  //   if (Platform.OS === "web") return;
  //   const tapSub = Notifications.addNotificationResponseReceivedListener(
  //     (response) => {
  //       const data = (response.notification.request.content.data ?? {}) as any;
  //       const url = data.deeplink || data.action_url;
  //       if (!url) return;
  //       try {
  //         if (typeof url === "string" && url.startsWith("http")) {
  //           Linking.openURL(url);
  //         } else {
  //           router.push(url as any);
  //         }
  //       } catch {}
  //     }
  //   );
  //   Notifications.getLastNotificationResponseAsync().then((response) => {
  //     if (!response) return;
  //     const data = (response.notification.request.content.data ?? {}) as any;
  //     const url = data.deeplink || data.action_url;
  //     if (!url) return;
  //     try {
  //       if (typeof url === "string" && url.startsWith("http")) {
  //         Linking.openURL(url);
  //       } else {
  //         router.push(url as any);
  //       }
  //     } catch {}
  //   }).catch(() => {});
  //   (async () => {
  //     try {
  //       const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  //       if (status !== "denied" || canAskAgain) return;
  //       const lastNudge = await AsyncStorage.getItem("amass_pushNudgeAt");
  //       const oneWeek = 7 * 24 * 60 * 60 * 1000;
  //       if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
  //       await AsyncStorage.setItem("amass_pushNudgeAt", String(Date.now()));
  //       const { Alert } = await import("react-native");
  //       Alert.alert(
  //         "Turn on notifications?",
  //         "Get a phone buzz the moment a new lead or message arrives.",
  //         [
  //           { text: "Later", style: "cancel" },
  //           { text: "Open Settings", onPress: () => Linking.openSettings() },
  //         ]
  //       );
  //     } catch {}
  //   })();
  //   return () => {
  //     tapSub.remove();
  //   };
  // }, [router]);

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
                    <ToastProvider>
                      <ThemedStack />
                    </ToastProvider>
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
