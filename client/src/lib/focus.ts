const ENABLED_BUTTON = "button:not([disabled])";

// Returns the element itself when it is an enabled button, otherwise the first
// enabled button inside it. Disabled buttons are skipped because they cannot
// receive focus, and calling focus() on them silently does nothing.
function findEnabledButton(candidate: Element | null | undefined): HTMLElement | null {
  if (!candidate) return null;
  if (candidate instanceof HTMLElement && candidate.matches(ENABLED_BUTTON)) return candidate;
  return candidate.querySelector<HTMLElement>(ENABLED_BUTTON);
}

// Moves keyboard focus to the first candidate that contains something focusable.
//
// Why this exists: when the focused button is removed from the page (deleting a
// card or a column), the browser drops focus on <body>. A keyboard or
// screen-reader user then has to tab from the very top of the page again.
// Calling this BEFORE the delete hands focus to a neighbour that stays.
export function focusFirstAvailable(...candidates: (Element | null | undefined)[]): void {
  for (const candidate of candidates) {
    const button = findEnabledButton(candidate);
    if (button) {
      button.focus();
      return;
    }
  }
}
