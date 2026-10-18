import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { focusFirstAvailable } from "../lib/focus";
import { isTempId } from "../lib/ids";
import { useBoardStore } from "../store/boardStore";
import type { Card } from "../types";
import {
  fieldLabelClass,
  ghostButton,
  inputClass,
  primaryButton,
  smallButton,
  smallDangerButton,
} from "./styles";

interface CardItemProps {
  card: Card;
}

export function CardItem({ card }: CardItemProps) {
  const editCard = useBoardStore((state) => state.editCard);
  const deleteCard = useBoardStore((state) => state.deleteCard);

  // A card with a temporary id is not on the server yet. Dragging, editing or
  // deleting it now would send requests for an id the server has never heard of.
  const isPending = isTempId(card.id);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: isPending });

  const style = { transform: CSS.Transform.toString(transform), transition };

  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(card.title);
  const [draftDescription, setDraftDescription] = useState(card.description);

  // dnd-kit needs its own ref on the <li>; we need one too, to find the
  // neighbouring cards when this card is deleted. This keeps both in sync.
  const listItemRef = useRef<HTMLLIElement | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Ids that tie each visible label to its field.
  const titleInputId = useId();
  const descriptionInputId = useId();

  // Focus follows the user: into the form when editing starts, back to the
  // Edit button when it ends.
  useEffect(() => {
    if (isEditing) {
      titleRef.current?.focus();
    } else if (wasEditing.current) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = isEditing;
  }, [isEditing]);

  function startEditing() {
    // Start from the latest saved values, in case another user changed the card.
    setDraftTitle(card.title);
    setDraftDescription(card.description);
    setIsEditing(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    const description = draftDescription.trim();
    if (!title) return;

    // Skip the network round trip when nothing actually changed.
    if (title !== card.title || description !== card.description) {
      void editCard(card.id, { title, description });
    }
    setIsEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") setIsEditing(false);
  }

  function handleDelete() {
    const item = listItemRef.current;
    const column = item?.closest("section");

    // The Delete button is about to disappear together with the card. Without
    // this, focus would drop to <body> and a keyboard user would have to tab
    // from the top of the page again. Hand focus to the next card, else the
    // previous one, else the column's "Add card" button, else anything in the column.
    focusFirstAvailable(
      item?.nextElementSibling,
      item?.previousElementSibling,
      column?.querySelector("[data-add-trigger]"),
      column,
    );
    void deleteCard(card.id);
  }

  return (
    <li
      ref={(node) => {
        listItemRef.current = node;
        setNodeRef(node);
      }}
      style={style}
      // While dragging, the original stays in the list as a faded placeholder
      // and the DragOverlay shows the card that follows the pointer. A card that
      // is still saving gets a dashed border instead of being faded: fading made
      // its text too faint to read (it dropped below 4.5:1 contrast).
      className={`rounded-xl border border-line bg-card shadow-sm ${isDragging ? "opacity-40" : ""} ${
        isPending ? "border-dashed" : ""
      }`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="p-3">
          {/* The legend tells a screen-reader user WHICH card is being edited,
              since several cards can be in edit mode at the same time. */}
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="sr-only">Edit card: {card.title}</legend>
            <div className="flex flex-col gap-1">
              <label htmlFor={titleInputId} className={fieldLabelClass}>
                Title
              </label>
              <input
                id={titleInputId}
                ref={titleRef}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                maxLength={200}
                aria-required="true"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={descriptionInputId} className={fieldLabelClass}>
                Description (optional)
              </label>
              <textarea
                id={descriptionInputId}
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                maxLength={2000}
                rows={3}
                className={inputClass}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={!draftTitle.trim()} className={primaryButton}>
                Save
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className={ghostButton}>
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="flex items-start gap-1 p-2">
          {/* The handle is the only drag activator, so the Edit and Delete
              buttons keep working normally and Space on them never starts a drag.
              Spreading `attributes` adds the ARIA roles dnd-kit needs. */}
          <button
            ref={setActivatorNodeRef}
            type="button"
            disabled={isPending}
            {...attributes}
            {...listeners}
            // Lets the board put focus back on this handle after a keyboard drag.
            data-card-handle={card.id}
            aria-label={`Drag card: ${card.title}`}
            className="mt-0.5 cursor-grab touch-none rounded-md p-1 text-ink-soft hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
              <circle cx="5" cy="3" r="1.4" />
              <circle cx="11" cy="3" r="1.4" />
              <circle cx="5" cy="8" r="1.4" />
              <circle cx="11" cy="8" r="1.4" />
              <circle cx="5" cy="13" r="1.4" />
              <circle cx="11" cy="13" r="1.4" />
            </svg>
          </button>

          <div className="min-w-0 flex-1 py-1">
            <h3 className="break-words text-sm font-semibold leading-snug">{card.title}</h3>
            {card.description && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-soft">
                {card.description}
              </p>
            )}
            {isPending && <p className="mt-1 text-xs text-ink-soft">Saving…</p>}
          </div>

          <div className="flex flex-col items-end">
            <button
              ref={editButtonRef}
              type="button"
              disabled={isPending}
              onClick={startEditing}
              aria-label={`Edit card: ${card.title}`}
              className={smallButton}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleDelete}
              aria-label={`Delete card: ${card.title}`}
              className={smallDangerButton}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// What follows the pointer while dragging. It is a plain visual copy: it must
// not call useSortable, because the real card is still in the list.
// aria-hidden: screen readers get the drag announcements instead, and reading
// this copy as well would repeat the card's text.
// No rotation: a tilt moves the overlay's measured box about 5px up and left of
// the real card, and dnd-kit's keyboard logic then treats the column list itself
// as "below" the card, so the first arrow key press goes nowhere or to the wrong target.
export function CardOverlay({ card }: CardItemProps) {
  return (
    <div
      aria-hidden="true"
      className="cursor-grabbing rounded-xl border border-accent bg-card p-3 shadow-xl"
    >
      <p className="break-words text-sm font-semibold leading-snug">{card.title}</p>
      {card.description && (
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink-soft">
          {card.description}
        </p>
      )}
    </div>
  );
}
