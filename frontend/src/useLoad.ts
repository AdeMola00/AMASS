import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

// Load data whenever the screen is focused; keeps the last good data while reloading.
export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    try {
      setError(false);
      setData(await fnRef.current());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload, ...deps]),
  );
  return { data, error, loading, reload, setData };
}
