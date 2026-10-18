import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ghostButton, inputClass, primaryButton } from "./styles";

interface AddItemFormProps {
  // Text of the button that opens the form, for example "Add card".
  openLabel: string;
  // Spoken name of the opening button when the visible text alone is ambiguous.
  // Every column has an "Add card" button, so a screen-reader user listing the
  // buttons needs to hear which column each one belongs to.
  openAriaLabel?: string;
  // Names the group of fields for screen readers, for example "Add a card to To do".
  // It is not shown on screen.
  legend: string;
  titleLabel: string;
  maxTitleLength: number;
  withDescription?: boolean;
  disabled?: boolean;
  onSubmit: (title: string, description: string) => void;
}

// Used for both "add column" and "add card". It starts as a single button and
// expands into a small form, so the board stays calm until you need it.
export function AddItemForm({
  openLabel,
  openAriaLabel,
  legend,
  titleLabel,
  maxTitleLength,
  withDescription = false,
  disabled = false,
  onSubmit,
}: AddItemFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Keyboard users must not lose their place: move focus into the form when it
  // opens and back to the opening button when it closes.
  useEffect(() => {
    if (isOpen) {
      titleRef.current?.focus();
    } else if (wasOpen.current) {
      openButtonRef.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setTitle("");
    setDescription("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    onSubmit(trimmedTitle, description.trim());

    // Stay open and keep focus in the title field so several items can be
    // added in a row without reaching for the mouse.
    setTitle("");
    setDescription("");
    titleRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") close();
  }

  if (!isOpen) {
    return (
      <button
        ref={openButtonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        aria-label={openAriaLabel}
        // Lets other code find this button, for example to move focus here after
        // the last card of a column is deleted.
        data-add-trigger=""
        // hover:text-accent-dark, not text-accent: the lighter orange is only
        // about 4.1:1 on the column background, below the 4.5:1 text minimum.
        className="w-full rounded-xl border border-dashed border-line px-3 py-2 text-left text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        + {openLabel}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      {/* A fieldset with a legend gives the fields a spoken group name without
          creating an extra landmark. min-w-0 stops long content from stretching it. */}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="sr-only">{legend}</legend>
        <input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={maxTitleLength}
          aria-label={titleLabel}
          aria-required="true"
          placeholder={titleLabel}
          className={inputClass}
        />
        {withDescription && (
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={2}
            aria-label="Description (optional)"
            placeholder="Description (optional)"
            className={inputClass}
          />
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={!title.trim()} className={primaryButton}>
            {openLabel}
          </button>
          <button type="button" onClick={close} className={ghostButton}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
