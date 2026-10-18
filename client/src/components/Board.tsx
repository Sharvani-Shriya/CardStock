import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  Announcements,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  KeyboardCoordinateGetter,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { groupCardIdsByColumn, sortByPosition } from "../lib/board";
import { useBoardStore } from "../store/boardStore";
import { AddItemForm } from "./AddItemForm";
import { CardOverlay } from "./CardItem";
import { ColumnView } from "./ColumnView";

type ItemsByColumn = Record<string, string[]>;

// Cycled by column index. These are used as inline border colors.
const COLUMN_ACCENTS = ["#c2410c", "#2f7d4f", "#2b6cb0", "#b7791f", "#805ad5", "#c2255c"];

// The keys of the map are column ids, so an id that is a key means "the column
// itself" (dnd-kit reports that when the pointer is over empty column space);
// any other id is a card, so look for the column whose list contains it.
function findContainer(items: ItemsByColumn, id: string): string | undefined {
  if (id in items) return id;
  return Object.keys(items).find((columnId) => items[columnId].includes(id));
}

// Decides where an arrow key may send the dragged card.
//
// Up and Down only reorder inside the current column. They keep using dnd-kit's
// own logic (sortableKeyboardCoordinates), limited to the cards of that column,
// because the column's list sits 4px outside its cards and would otherwise be
// picked as a target by mistake.
//
// Left and Right walk through the columns in DISPLAY ORDER instead of by screen
// position. Columns wrap onto new rows when the screen is narrow, and a
// position-based search finds nothing "to the right" of the last column in a row,
// which would leave every column on the next row out of reach of the keyboard.
// Going by order also matches what a screen-reader user hears: the next column.
function createKeyboardCoordinates(getItems: () => ItemsByColumn | null): KeyboardCoordinateGetter {
  return (event, args) => {
    const items = getItems();
    const active = args.context.active;
    const currentColumn = items && active ? findContainer(items, String(active.id)) : undefined;
    if (!items || !currentColumn) return sortableKeyboardCoordinates(event, args);

    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      // The keys are consumed even at the first or last column, otherwise the
      // browser would scroll the page while a card is being carried.
      event.preventDefault();

      // The keys of the map are the column ids in display order (see groupCardIdsByColumn).
      const order = Object.keys(items);
      const step = event.code === "ArrowRight" ? 1 : -1;
      const targetColumn = order[order.indexOf(currentColumn) + step];
      const rect = targetColumn ? args.context.droppableRects.get(targetColumn) : undefined;
      if (!rect) return undefined;

      // Put the card's top-left corner on the column's top-left corner; collision
      // detection then decides whether that means "first card" or "empty column".
      return { x: rect.left, y: rect.top };
    }

    if (event.code !== "ArrowUp" && event.code !== "ArrowDown") {
      return sortableKeyboardCoordinates(event, args);
    }

    const all = args.context.droppableContainers;
    // sortableKeyboardCoordinates only calls getEnabled() and get() on this map,
    // so a small stand-in that filters the first one is enough.
    const filtered = {
      get: (id: UniqueIdentifier) => all.get(id),
      getEnabled: () =>
        all.getEnabled().filter((container) => {
          const id = String(container.id);
          return !(id in items) && findContainer(items, id) === currentColumn;
        }),
    } as unknown as typeof all;

    return sortableKeyboardCoordinates(event, {
      ...args,
      context: { ...args.context, droppableContainers: filtered },
    });
  };
}

export function Board() {
  const columns = useBoardStore((state) => state.columns);
  const cards = useBoardStore((state) => state.cards);
  const addColumn = useBoardStore((state) => state.addColumn);
  const moveCard = useBoardStore((state) => state.moveCard);

  const prefersReducedMotion = usePrefersReducedMotion();

  // Zustand v5 requires selectors to return stable references, so we select the
  // raw arrays above and derive the sorted/grouped views here with useMemo.
  const sortedColumns = useMemo(() => sortByPosition(columns), [columns]);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const columnsById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );
  const itemsByColumn = useMemo(
    () => groupCardIdsByColumn(sortedColumns, cards),
    [sortedColumns, cards],
  );

  // While a card is being dragged we move it between lists in this local copy
  // only. The store (and the server) are touched once, when the card is dropped.
  // That avoids sending a request for every column the pointer passes over.
  const [dragItems, setDragItems] = useState<ItemsByColumn | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  // The card whose drag handle should get keyboard focus back after a drag.
  const [cardToFocus, setCardToFocus] = useState<string | null>(null);

  const visibleItems = dragItems ?? itemsByColumn;
  const activeCard = activeCardId ? cardsById.get(activeCardId) : undefined;

  // While a card is carried into another column with the keyboard, its element is
  // rebuilt inside the new column and the browser forgets which element had
  // focus. This runs after React has drawn the final layout (so the handle
  // exists in its final place) and puts focus back, so the user can keep going.
  useEffect(() => {
    if (cardToFocus === null) return;

    // Card ids are hex strings or UUIDs, so they are safe inside the quotes.
    document.querySelector<HTMLElement>(`[data-card-handle="${cardToFocus}"]`)?.focus();
    setCardToFocus(null);
  }, [cardToFocus]);

  // The keyboard sensor lives longer than one render, so it reads the working
  // copy of the lists through a ref to always see the card's current column.
  const dragItemsRef = useRef<ItemsByColumn | null>(null);
  useEffect(() => {
    dragItemsRef.current = dragItems;
  }, [dragItems]);
  const keyboardCoordinates = useMemo(
    () => createKeyboardCoordinates(() => dragItemsRef.current),
    [],
  );

  const sensors = useSensors(
    // The small distance lets a plain click on the handle pass through without
    // starting a drag, and keeps touch scrolling from triggering one by accident.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  function cardTitle(id: UniqueIdentifier): string {
    return cardsById.get(String(id))?.title ?? "card";
  }

  function describeTarget(id: UniqueIdentifier): string {
    const key = String(id);

    const column = columnsById.get(key);
    if (column) return `column ${column.title}`;

    const card = cardsById.get(key);
    if (!card) return "an unknown area";

    const containerId = findContainer(visibleItems, key);
    const container = containerId ? columnsById.get(containerId) : undefined;
    return container ? `card ${card.title} in column ${container.title}` : `card ${card.title}`;
  }

  // Spoken by screen readers during a drag. dnd-kit's defaults mention opaque
  // ids, so we replace them with the real card and column titles.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up card ${cardTitle(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Card ${cardTitle(active.id)} is over ${describeTarget(over.id)}.`
        : `Card ${cardTitle(active.id)} is not over a column.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped card ${cardTitle(active.id)} on ${describeTarget(over.id)}.`
        : `Dropped card ${cardTitle(active.id)}. It stays where it was.`,
    onDragCancel: ({ active }) =>
      `Moving card ${cardTitle(active.id)} was cancelled. It stays where it was.`,
  };

  function handleDragStart({ active }: DragStartEvent) {
    setDragItems(itemsByColumn);
    setActiveCardId(String(active.id));
  }

  // Fires while the dragged card hovers over something new. When that is
  // another column, move the card into that column's list so the layout opens
  // a gap there, exactly where the card would land.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setDragItems((previous) => {
      if (!previous) return previous;

      const from = findContainer(previous, activeId);
      const to = findContainer(previous, overId);
      if (!from || !to || from === to) return previous;

      const targetItems = previous[to];
      let insertAt: number;

      if (overId in previous) {
        // Hovering the column itself (for example an empty one): go to the end.
        insertAt = targetItems.length;
      } else {
        // Hovering a card: land after it if the dragged card is past its midpoint.
        const draggedTop = active.rect.current.translated?.top ?? 0;
        const isBelowMiddle = draggedTop > over.rect.top + over.rect.height / 2;
        insertAt = targetItems.indexOf(overId) + (isBelowMiddle ? 1 : 0);
      }

      return {
        ...previous,
        [from]: previous[from].filter((id) => id !== activeId),
        [to]: [...targetItems.slice(0, insertAt), activeId, ...targetItems.slice(insertAt)],
      };
    });
  }

  // Works out where the card ended up and commits it. Kept separate from
  // handleDragEnd so the drag state is cleaned up on every exit path.
  function commitDrop({ active, over }: DragEndEvent) {
    const current = dragItems;
    if (!over || !current) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const container = findContainer(current, activeId);
    if (!container || container !== findContainer(current, overId)) return;

    // Same column (including a card that was already carried into this column
    // by handleDragOver): apply the final reorder, if any.
    const list = current[container];
    const oldIndex = list.indexOf(activeId);
    const newIndex = overId in current ? list.length - 1 : list.indexOf(overId);
    const finalList = oldIndex === newIndex ? list : arrayMove(list, oldIndex, newIndex);
    const finalIndex = finalList.indexOf(activeId);

    // Dropping a card exactly where it started is not a change.
    const originalContainer = findContainer(itemsByColumn, activeId);
    const originalIndex = originalContainer ? itemsByColumn[originalContainer].indexOf(activeId) : -1;
    if (originalContainer === container && originalIndex === finalIndex) return;

    void moveCard(activeId, container, finalIndex);
  }

  // Only keyboard drags need this: after a mouse drag nobody expects the
  // handle to take focus. The event that started the drag tells us which it was.
  function restoreFocusAfterKeyboardDrag(event: DragEndEvent) {
    if (event.activatorEvent instanceof KeyboardEvent) {
      setCardToFocus(String(event.active.id));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    // Commit first so the store already has the new order when the temporary
    // drag copy is dropped, which avoids a one-frame flash of the old order.
    commitDrop(event);
    setDragItems(null);
    setActiveCardId(null);
    restoreFocusAfterKeyboardDrag(event);
  }

  // Escape during a keyboard drag lands here. The card goes back to where it
  // started, which rebuilds its element, so focus has to be restored here too.
  function handleDragCancel(event: DragEndEvent) {
    setDragItems(null);
    setActiveCardId(null);
    restoreFocusAfterKeyboardDrag(event);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To pick up a card, focus its drag handle and press space or enter. Use the arrow keys to move it between positions and columns, press space or enter again to drop it, or press escape to cancel.",
        },
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* Columns stack on phones. From the md breakpoint up they sit side by side
          and wrap onto a new row when the row is full, so the board never needs
          a horizontal scrollbar. There is deliberately no overflow rule here: a
          scrolling container would also clip the focus ring of the buttons at its
          edges. */}
      <div className="flex flex-col gap-5 pb-8 md:flex-row md:flex-wrap md:items-start">
        {sortedColumns.map((column, index) => (
          <ColumnView
            key={column.id}
            column={column}
            accent={COLUMN_ACCENTS[index % COLUMN_ACCENTS.length]}
            cardIds={visibleItems[column.id] ?? itemsByColumn[column.id] ?? []}
            cardsById={cardsById}
          />
        ))}

        <div className="w-full shrink-0 md:w-80">
          <AddItemForm
            openLabel="Add column"
            legend="Add a column"
            titleLabel="Column title"
            maxTitleLength={100}
            onSubmit={(title) => {
              void addColumn(title);
            }}
          />
        </div>
      </div>

      {/* The drop animation is driven from JavaScript, so the CSS
          prefers-reduced-motion rule cannot switch it off. null disables it. */}
      <DragOverlay dropAnimation={prefersReducedMotion ? null : undefined}>
        {activeCard ? <CardOverlay card={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
