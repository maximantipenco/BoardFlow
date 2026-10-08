import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Card, Column, FullBoard } from '../types';

export default function BoardPage() {
  const { id } = useParams();
  const [board, setBoard] = useState<FullBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newColumn, setNewColumn] = useState('');

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

            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
              {col.cards.map((card) => (
                <li
                  key={card.id}
                  style={{
                    background: 'white',
                    borderRadius: 6,
                    padding: 8,
                    boxShadow: '0 1px 2px #0003',
                  }}
                >
                  <div>{card.title}</div>
                  {card.description && <small style={{ color: '#555' }}>{card.description}</small>}
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button onClick={() => editCard(card)}>Edit</button>
                    <button onClick={() => deleteCard(card)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>

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
