import React from "react";
import { Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { ListRow, useToast } from "@/src/ui";

/**
 * The only mention of professional tools in the consumer app: agents, FIXA pros and brands manage
 * listings, enquiries, bookings and orders in the separate AMASS Agent app.
 * EXPO_PUBLIC_AGENT_APP_URL (store / landing page / preview link) is what the row opens.
 */
const AGENT_APP_URL = (process.env.EXPO_PUBLIC_AGENT_APP_URL ?? "").trim();

export function AgentAppPointer({ last = true }: { last?: boolean }) {
  const toast = useToast();
  const { colors } = useTheme();
  return (
    <ListRow
      icon="briefcase-outline"
      iconTone="default"
      label="Agent, FIXA pro or brand?"
      caption={AGENT_APP_URL ? "Opens the AMASS Agent app" : "Listings, enquiries and bookings live in the AMASS Agent app"}
      trailing={AGENT_APP_URL ? <Ionicons name="open-outline" size={18} color={colors.textMuted} /> : undefined}
      onPress={() => {
        if (AGENT_APP_URL) Linking.openURL(AGENT_APP_URL).catch(() => toast.error("Couldn't open the Agent app", "Check your connection and try again."));
        else toast.info("AMASS Agent app", "Coming soon — professional tools are moving to their own app.");
      }}
      last={last}
      testID="agent-app-pointer"
    />
  );
}
