import { useCallback, useEffect, useRef } from "react";

// Returns a stable function identity that always calls the latest callback.
// Useful for intervals/effects that should not re-subscribe on every render.
export function useCallbackRef<T extends (...args: any[]) => any>(cb: T): T {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
}
