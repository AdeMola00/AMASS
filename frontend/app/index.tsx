import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth";
import { LoadingView } from "@/src/ui";

export default function Index() {
  const { status, roles, kind } = useAuth();
  if (status === "loading") return <LoadingView />;
  if (status === "out") return <Redirect href="/login" />;
  if (kind === "user" && roles.length === 0) return <Redirect href="/welcome" />;
  return <Redirect href="/(tabs)" />;
}
