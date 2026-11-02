import { useSyncExternalStore } from "react";

const painted = new Map<string, unknown>();
const noSubscribe = () => () => {};

/**
 * A stipple painted once in the browser (painting needs a canvas) and shared
 * by everything that asks for the same `key`. Null while rendering on the
 * server, so the page hydrates cleanly and the stipple appears straight after.
 */
export function useStipple<T>(key: string, paint: () => T): T | null {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      if (!painted.has(key)) painted.set(key, paint());
      return painted.get(key) as T;
    },
    () => null,
  );
}

/** Styles that cut a `currentColor` fill to a painted stipple (or any image's shape) */
export function stippleMask(src: string) {
  return {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
  };
}
