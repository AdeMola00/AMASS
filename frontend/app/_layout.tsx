import { QueryClientProvider } from "@tanstack/react-query";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { SettingsProvider } from "@/src/settings";
import { colors } from "@/src/theme";
import { ToastProvider } from "@/src/ui";

LogBox.ignoreAllLogs(true);

// Prewarm icon font: under Expo Go (Android) the autolinked .ttf can resolve as 0 bytes, so load it from the CDN.
const ICON_FONTS: Record<string, string> =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? { Ionicons: "https://cdn.jsdelivr.net/npm/@react-native-vector-icons/ionicons@14.0.0/fonts/Ionicons.ttf" }
    : {};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...ICON_FONTS,
    DMSerifDisplay: require("../assets/fonts/DMSerifDisplay-Regular.ttf"),
    "Jakarta-500": require("../assets/fonts/PlusJakartaSans-500.ttf"),
    "Jakarta-600": require("../assets/fonts/PlusJakartaSans-600.ttf"),
    "Jakarta-700": require("../assets/fonts/PlusJakartaSans-700.ttf"),
    "Jakarta-800": require("../assets/fonts/PlusJakartaSans-800.ttf"),
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <SettingsProvider>
              <AuthProvider>
                <ToastProvider>
                  <StatusBar style="dark" />
                  {loaded || error ? (
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
                  ) : (
                    <View style={styles.boot}>
                      <ActivityIndicator size="large" color={colors.brandPrimary} />
                    </View>
                  )}
                </ToastProvider>
              </AuthProvider>
            </SettingsProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
