/**
 * Bottom tab bar metrics — one source of truth so screens keep their last row of content and
 * any floating controls clear of the bar. The bar is a solid, full-width band (not a floating
 * pill): the map, preview card and sticky actions always sit ABOVE it, never underneath.
 */
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Height of the bar above the home-indicator inset. */
export const TAB_BAR_HEIGHT = 66;

/** Distance from the bottom of the screen to the TOP of the bar — pad scroll content / position FABs with this. */
export function useTabBarOffset() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 8);
}
