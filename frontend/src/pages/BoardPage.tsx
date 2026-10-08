import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { api } from '../api';
import CardItem from '../components/CardItem';
import ColumnDropZone from '../components/ColumnDropZone';
import type { Card, Column, FullBoard } from '../types';

export default function BoardPage() {
  const { id } = useParams();
  const [board, setBoard] = useState<FullBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newColumn, setNewColumn] = useState('');

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const snapshot = useRef<Column[] | null>(null);

  // Distance 5 lets simple clicks on buttons work without starting a drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function findColumnOf(columns: Column[], dndId: string): Column | undefined {
    if (dndId.startsWith('column-')) {
      const colId = Number(dndId.slice('column-'.length));
      return columns.find((c) => c.id === colId);
    }
    const cardId = Number(dndId.slice('card-'.length));
    return columns.find((c) => c.cards.some((card) => card.id === cardId));
  }

  function handleDragStart(event: DragStartEvent) {
    snapshot.current = board?.columns ?? null;
    setActiveCard((event.active.data.current?.card as Card) ?? null);
  }

  // While dragging over another column, move the card there immediately
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    updateColumns((cols) => {
      const from = findColumnOf(cols, activeId);
      const to = findColumnOf(cols, overId);
      if (!from || !to || from.id === to.id) return cols;

      const card = from.cards.find((c) => `card-${c.id}` === activeId)!;
      const overIndex = to.cards.findIndex((c) => `card-${c.id}` === overId);
      const insertAt = overIndex >= 0 ? overIndex : to.cards.length;

      return cols.map((c) => {
        if (c.id === from.id) return { ...c, cards: c.cards.filter((x) => x.id !== card.id) };
        if (c.id === to.id) {
          const cards = [...c.cards];
          cards.splice(insertAt, 0, { ...card, column_id: to.id });
          return { ...c, cards };
        }
        return c;
      });
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    const activeId = String(active.id);

    if (!over || !board) {
      if (snapshot.current) updateColumns(() => snapshot.current!);
      return;
    }

    // Work out the final order inside the (possibly new) column
    let columns = board.columns;
    const col = findColumnOf(columns, activeId);
    if (!col) return;

    const oldIndex = col.cards.findIndex((c) => `card-${c.id}` === activeId);
    const overIndex = col.cards.findIndex((c) => `card-${c.id}` === String(over.id));
    let position = oldIndex;

    if (overIndex >= 0 && overIndex !== oldIndex) {
      position = overIndex;
      const cards = [...col.cards];
      const [moved] = cards.splice(oldIndex, 1);
      cards.splice(overIndex, 0, moved);
      columns = columns.map((c) => (c.id === col.id ? { ...c, cards } : c));
      updateColumns(() => columns);
    }

    const cardId = Number(activeId.slice('card-'.length));
    const original = snapshot.current
      ?.flatMap((c) => c.cards.map((card, index) => ({ card, index })))
      .find((x) => x.card.id === cardId);
    const unchanged = original && original.card.column_id === col.id && original.index === position;
    if (unchanged) return;

    try {
      await api(`/cards/${cardId}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ columnId: col.id, position }),
      });
    } catch (err) {
      // Server refused: roll the screen back to how it was
      if (snapshot.current) updateColumns(() => snapshot.current!);
      fail(err);
    }
  }

  useEffect(() => {
    api<FullBoard>(`/boards/${id}/full`)
      .then(setBoard)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : 'Something went wrong');
  }

  // Helper: change one column's data inside the board state
  function updateColumns(fn: (columns: Column[]) => Column[]) {
    setBoard((prev) => (prev ? { ...prev, columns: fn(prev.columns) } : prev));
  }

  async function addColumn(e: FormEvent) {
    e.preventDefault();
    if (!newColumn.trim()) return;
    try {
      const col = await api<Omit<Column, 'cards'>>(`/boards/${id}/columns`, {
        method: 'POST',
        body: JSON.stringify({ title: newColumn }),
      });
      updateColumns((cols) => [...cols, { ...col, cards: [] }]);
      setNewColumn('');
    } catch (err) {
      fail(err);
    }
  }

  async function renameColumn(col: Column) {
    const title = window.prompt('Column name', col.title)?.trim();
    if (!title || title === col.title) return;
    try {
      await api(`/columns/${col.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      updateColumns((cols) => cols.map((c) => (c.id === col.id ? { ...c, title } : c)));
    } catch (err) {
      fail(err);
    }
  }

  async function deleteColumn(col: Column) {
    if (!window.confirm(`Delete column "${col.title}" and its cards?`)) return;
    try {
      await api(`/columns/${col.id}`, { method: 'DELETE' });
      updateColumns((cols) => cols.filter((c) => c.id !== col.id));
    } catch (err) {
      fail(err);
    }
  }

  async function addCard(col: Column, title: string) {
    try {
      const card = await api<Card>(`/columns/${col.id}/cards`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      updateColumns((cols) =>
        cols.map((c) => (c.id === col.id ? { ...c, cards: [...c.cards, card] } : c)),
      );
    } catch (err) {
      fail(err);
    }
  }

  async function editCard(card: Card) {
    const title = window.prompt('Card title', card.title)?.trim();
    if (!title) return;
    const description = window.prompt('Description (optional)', card.description ?? '');
    if (description === null) return;
    try {
      const updated = await api<Card>(`/cards/${card.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, description: description.trim() || null }),
      });
      updateColumns((cols) =>
        cols.map((c) => ({
          ...c,
          cards: c.cards.map((x) => (x.id === updated.id ? updated : x)),
        })),
      );
    } catch (err) {
      fail(err);
    }
  }

  async function deleteCard(card: Card) {
    if (!window.confirm(`Delete card "${card.title}"?`)) return;
    try {
      await api(`/cards/${card.id}`, { method: 'DELETE' });
      updateColumns((cols) =>
        cols.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== card.id) })),
      );
    } catch (err) {
      fail(err);
    }
  }

  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;
  if (!board) {
    return (
      <main style={{ padding: 16 }}>
        <p style={{ color: 'crimson' }}>{error || 'Board not found'}</p>
        <Link to="/">Back to boards</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Link to="/">&larr; Boards</Link>
        <h1 style={{ margin: 0 }}>{board.title}</h1>
      </header>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 16 }}>
          {board.columns.map((col) => (
            <section
              key={col.id}
              style={{
                width: 280,
                flexShrink: 0,
                background: '#f1f2f4',
                borderRadius: 8,
                padding: 12,
                color: '#222',
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{col.title}</strong>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => renameColumn(col)}>Rename</button>
                  <button onClick={() => deleteColumn(col)}>Delete</button>
                </span>
              </header>

              <SortableContext
                items={col.cards.map((c) => `card-${c.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <ColumnDropZone columnId={col.id}>
                  {col.cards.map((card) => (
                    <CardItem key={card.id} card={card} onEdit={editCard} onDelete={deleteCard} />
                  ))}
                </ColumnDropZone>
              </SortableContext>

              <AddCardForm onAdd={(title) => addCard(col, title)} />
            </section>
          ))}

          <form onSubmit={addColumn} style={{ width: 280, flexShrink: 0, display: 'grid', gap: 8 }}>
            <input
              placeholder="New column name"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
            />
            <button type="submit">Add column</button>
          </form>
        </div>

        <DragOverlay>
          {activeCard ? (
            <ul style={{ margin: 0, padding: 0 }}>
              <CardItem card={activeCard} onEdit={editCard} onDelete={deleteCard} overlay />
            </ul>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}

function AddCardForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim());
    setTitle('');
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 4 }}>
      <input
        style={{ flex: 1, minWidth: 0 }}
        placeholder="New card"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="submit">+</button>
    </form>
  );
}
