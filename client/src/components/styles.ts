// Shared Tailwind class strings, so buttons and inputs look the same everywhere
// and a restyle only has to happen in one place.

// border-field (not border-line): the edge of a text field must reach 3:1
// contrast to be perceivable, see the note on --color-field in index.css.
export const inputClass =
  "w-full rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft";

export const primaryButton =
  "rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50";

export const ghostButton =
  "rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-paper hover:text-ink";

export const smallButton =
  "rounded-md px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

export const smallDangerButton =
  "rounded-md px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-red-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40";

// Small caption shown above a field in the edit forms.
export const fieldLabelClass = "text-xs font-semibold text-ink-soft";
