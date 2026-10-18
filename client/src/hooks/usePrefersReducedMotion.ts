import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// jsdom (used by the unit tests) has no matchMedia, so check before calling it.
function readPreference(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// The CSS rule in index.css switches off CSS transitions and animations, but the
// drag library's "drop" animation is run from JavaScript, which CSS cannot reach.
// The board reads this value to turn that animation off as well.
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;

    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    // The setting can change while the page is open (for example in the OS settings).
    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}
