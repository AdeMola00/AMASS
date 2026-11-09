import React from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { EmptyState, Screen } from "@/src/ui";
import { space } from "@/src/theme/tokens";

/** Safety net for stale deep links (e.g. professional screens that moved to the AMASS Agent app). */
export function NotFoundView() {
  const router = useRouter();
  return (
    <Screen testID="not-found-screen">
      <View style={styles.wrap}>
        <EmptyState
          icon="compass-outline"
          title="That page isn't in this app"
          body="Professional tools — listings, enquiries and bookings — now live in the AMASS Agent app. Everything for finding and living in your home is right here."
          actionLabel="Back to AMASS"
          actionIcon="home-outline"
          onAction={() => router.replace("/(tabs)" as any)}
          actionTestID="not-found-home"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: space[4] },
});
