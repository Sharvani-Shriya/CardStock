import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { focusFirstAvailable } from "../lib/focus";
import { isTempId } from "../lib/ids";
import { useBoardStore } from "../store/boardStore";
import type { Card, Column } from "../types";
import { AddItemForm } from "./AddItemForm";
import { CardItem } from "./CardItem";
import {
  fieldLabelClass,
  ghostButton,
  inputClass,
  primaryButton,
  smallButton,
  smallDangerButton,
} from "./styles";

interface ColumnViewProps {
  column: Column;
  // Color of the tab along the top edge, to tell columns apart at a glance.
  accent: string;
  // Card ids in display order. During a drag this is the Board's working copy,
  // not the store's, which is why it arrives as a prop.
  cardIds: string[];
  cardsById: Map<string, Card>;
}

export function ColumnView({ column, accent, cardIds, cardsById }: ColumnViewProps) {
  const renameColumn = useBoardStore((state) => state.renameColumn);
  const deleteColumn = useBoardStore((state) => state.deleteColumn);
  const addCard = useBoardStore((state) => state.addCard);

  const headingId = useId();
  const renameInputId = useId();
  const isPending = isTempId(column.id);

  // Needed to find the neighbouring columns when this one is deleted.
  const sectionRef = useRef<HTMLElement>(null);

  // Registers the whole card list as a drop target. Without it, an empty column
  // would have no cards to hover over and could never receive a drop.
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(column.title);

  const titleRef = useRef<HTMLInputElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const wasRenaming = useRef(false);

  useEffect(() => {
    if (isRenaming) {
      titleRef.current?.focus();
    } else if (wasRenaming.current) {
      renameButtonRef.current?.focus();
    }
    wasRenaming.current = isRenaming;
  }, [isRenaming]);

  function startRenaming() {
    setDraftTitle(column.title);
    setIsRenaming(true);
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;

    if (title !== column.title) {
      void renameColumn(column.id, title);
    }
    setIsRenaming(false);
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") setIsRenaming(false);
  }

  function handleDelete() {
    // Deleting a column also deletes its cards, so ask before doing it.
    const cardCount = cardIds.length;
    const warning =
      cardCount > 0
        ? `Delete "${column.title}" and its ${cardCount} card${cardCount === 1 ? "" : "s"}?`
        : `Delete "${column.title}"?`;
    if (!window.confirm(warning)) return;

    // The Delete button disappears together with the column. Hand focus to the
    // next column (or the "Add column" button after the last one), else the
    // previous column, so keyboard focus does not drop to <body>.
    focusFirstAvailable(
      sectionRef.current?.nextElementSibling,
      sectionRef.current?.previousElementSibling,
    );
    void deleteColumn(column.id);
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      style={{ borderTopColor: accent }}
      className="w-full shrink-0 rounded-2xl border border-t-4 border-line bg-paper-deep/70 p-3 md:w-80"
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        {isRenaming ? (
          <form onSubmit={handleRenameSubmit} onKeyDown={handleRenameKeyDown} className="min-w-0 flex-1">
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="sr-only">Rename column: {column.title}</legend>
              <div className="flex flex-col gap-1">
                <label htmlFor={renameInputId} className={fieldLabelClass}>
                  Column title
                </label>
                <input
                  id={renameInputId}
                  ref={titleRef}
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  maxLength={100}
                  aria-required="true"
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={!draftTitle.trim()} className={primaryButton}>
                  Save
                </button>
                <button type="button" onClick={() => setIsRenaming(false)} className={ghostButton}>
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        ) : (
          <>
            <h2 id={headingId} className="min-w-0 break-words font-display text-lg font-bold leading-tight">
              {column.title}
              <span className="ml-2 font-sans text-sm font-medium text-ink-soft">
                <span className="sr-only">, </span>
                {cardIds.length}
                <span className="sr-only">{cardIds.length === 1 ? " card" : " cards"}</span>
              </span>
            </h2>
            <div className="flex shrink-0 gap-0.5">
              <button
                ref={renameButtonRef}
                type="button"
                disabled={isPending}
                onClick={startRenaming}
                aria-label={`Rename column: ${column.title}`}
                className={smallButton}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                aria-label={`Delete column: ${column.title}`}
                className={smallDangerButton}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </header>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          aria-label={`Cards in ${column.title}`}
          className={`flex min-h-14 flex-col gap-2 rounded-xl p-1 transition-colors ${
            isOver ? "bg-accent/10" : ""
          }`}
        >
          {cardIds.map((id) => {
            const card = cardsById.get(id);
            return card ? <CardItem key={id} card={card} /> : null;
          })}
        </ul>
      </SortableContext>

      {cardIds.length === 0 && (
        <p className="px-2 pb-2 text-sm text-ink-soft">Nothing here yet. Drop a card or add one.</p>
      )}

      <div className="mt-2">
        <AddItemForm
          openLabel="Add card"
          // Every column has an "Add card" button, so the spoken name says which one.
          openAriaLabel={`Add card to ${column.title}`}
          legend={`Add a card to ${column.title}`}
          titleLabel="Card title"
          maxTitleLength={200}
          withDescription
          // A card cannot be saved into a column the server has not created yet.
          disabled={isPending}
          onSubmit={(title, description) => {
            void addCard(column.id, title, description);
          }}
        />
      </div>
    </section>
  );
}
