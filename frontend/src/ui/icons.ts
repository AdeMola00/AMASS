import type React from "react";
import Ionicons from "@react-native-vector-icons/ionicons";

/** Single icon set app-wide (Ionicons). Never mix sets or use emoji as icons. */
export type IconName = React.ComponentProps<typeof Ionicons>["name"];
