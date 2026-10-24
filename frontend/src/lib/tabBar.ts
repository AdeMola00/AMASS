/**
 * Floating tab bar metrics — one source of truth so screens can keep their last
 * row of content and any FABs clear of the pill (map sheet, feed FABs, long lists).
 */
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Height of the pill itself. */
export const TAB_BAR_HEIGHT = 66;
/** Gap between the pill and the home indicator / screen edge. */
export const TAB_BAR_GAP = 10;
/** Side margin of the pill (it floats, so the content shows around it). */
export const TAB_BAR_SIDE = 16;
/** Tablets / wide web: the pill stops growing and centres. */
export const TAB_BAR_MAX_WIDTH = 520;

/** Distance from the bottom of the screen to the TOP of the pill — pad scroll content / position FABs with this. */
export function useTabBarOffset() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + TAB_BAR_GAP + Math.max(insets.bottom, 12);
}

export function useTabBarWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width - TAB_BAR_SIDE * 2, TAB_BAR_MAX_WIDTH);
}
