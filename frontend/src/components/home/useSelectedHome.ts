/**
 * Selected home for the hub (remembered per device) + the list of homes. "all" is allowed on list screens.
 */
import { useCallback, useEffect, useState } from "react";
import { homeApi, selectedHome, type Home } from "@/src/lib/homeHub";

export function useSelectedHome(opts: { allowAll?: boolean } = {}) {
  const [homes, setHomes] = useState<Home[]>([]);
  const [homeId, setHomeIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [list, saved] = await Promise.all([homeApi.homes(), selectedHome.get()]);
      setHomes(list.items);
      const valid = saved && ((saved === "all" && opts.allowAll) || list.items.some((h) => h.id === saved));
      const fallback = list.items.find((h) => h.is_default)?.id ?? list.items[0]?.id ?? null;
      setHomeIdState(valid ? saved : fallback);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setReady(true);
    }
  }, [opts.allowAll]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setHomeId = useCallback((id: string) => {
    setHomeIdState(id);
    selectedHome.set(id);
  }, []);

  const home = homeId && homeId !== "all" ? homes.find((h) => h.id === homeId) ?? null : null;
  return { homes, homeId, home, setHomeId, ready, error, reload };
}
