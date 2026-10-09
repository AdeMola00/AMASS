// Loads the Plus Jakarta Sans family (local TTFs) for the premium Market UI.
// Works across Expo Go, native dev/prod builds and web.
import { useFonts } from "expo-font";

export const useAppFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    "PlusJakartaSans-400": require("../../assets/fonts/PlusJakartaSans-400.ttf"),
    "PlusJakartaSans-500": require("../../assets/fonts/PlusJakartaSans-500.ttf"),
    "PlusJakartaSans-600": require("../../assets/fonts/PlusJakartaSans-600.ttf"),
    "PlusJakartaSans-700": require("../../assets/fonts/PlusJakartaSans-700.ttf"),
  });
