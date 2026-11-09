import React from "react";
import { Linking } from "react-native";
import { ListRow, useToast } from "@/src/ui";

/**
 * The only mention of professional tools in the consumer app: agents, FIXA pros and brands manage
 * listings, enquiries, bookings and orders in the separate AMASS Agent app.
 * Set EXPO_PUBLIC_AGENT_APP_URL (store / landing page) to make the row open it.
 */
const AGENT_APP_URL = process.env.EXPO_PUBLIC_AGENT_APP_URL ?? "";

export function AgentAppPointer({ last = true }: { last?: boolean }) {
  const toast = useToast();
  return (
    <ListRow
      icon="briefcase-outline"
      iconTone="default"
      label="Agent, FIXA pro or brand?"
      caption="Manage listings, enquiries and bookings in the AMASS Agent app"
      onPress={() => {
        if (AGENT_APP_URL) Linking.openURL(AGENT_APP_URL).catch(() => {});
        else toast.info("AMASS Agent app", "Coming soon — professional tools are moving to their own app.");
      }}
      last={last}
      testID="agent-app-pointer"
    />
  );
}
