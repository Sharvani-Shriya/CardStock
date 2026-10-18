import { useEffect, useState } from "react";
import { useToastStore } from "../store/toastStore";

const TOAST_LIFETIME_MS = 6000;

interface ToastItemProps {
  id: number;
  message: string;
  onDismiss: (id: number) => void;
}

function ToastItem({ id, message, onDismiss }: ToastItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const isPaused = isHovered || hasFocus;

  // A message that vanishes on its own is a problem for people who read slowly
  // or use a screen magnifier (WCAG 2.2.1). The countdown therefore stops while
  // the pointer is over the toast or focus is inside it, and starts again from
  // the full time when the user moves away.
  useEffect(() => {
    if (isPaused) return undefined;

    const timer = window.setTimeout(() => onDismiss(id), TOAST_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [id, isPaused, onDismiss]);

  return (
    // role="alert" is announced immediately, which suits error messages.
    <div
      role="alert"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setHasFocus(true)}
      onBlur={() => setHasFocus(false)}
      className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl border border-accent bg-card px-4 py-3 text-sm shadow-lg"
    >
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="rounded-md px-1.5 text-lg leading-none text-ink-soft hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    // The wrapper ignores clicks so it never blocks the board underneath;
    // only the toasts themselves are clickable.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} id={toast.id} message={toast.message} onDismiss={dismiss} />
      ))}
    </div>
  );
}
