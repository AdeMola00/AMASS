import React from "react";
import { Stack } from "expo-router";
import { NotFoundView } from "@/src/components/NotFoundView";

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <NotFoundView />
    </>
  );
}
