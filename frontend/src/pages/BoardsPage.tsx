import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Board } from '../types';

export default function BoardsPage() {
  const { user, logout } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    api<Board[]>('/boards')
      .then(setBoards)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const board = await api<Board>('/boards', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      setBoards((prev) => [board, ...prev]);
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    }
  }

  async function handleRename(board: Board) {
    const newTitle = window.prompt('New board name', board.title)?.trim();
    if (!newTitle || newTitle === board.title) return;
    try {
      const updated = await api<Board>(`/boards/${board.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle }),
      });
      setBoards((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename board');
    }
  }

  async function handleDelete(board: Board) {
    if (!window.confirm(`Delete "${board.title}" with all its columns and cards?`)) return;
    try {
      await api(`/boards/${board.id}`, { method: 'DELETE' });
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete board');
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>My boards</h1>
        <div>
          {user?.name ?? user?.email} <button onClick={logout}>Log out</button>
        </div>
      </header>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input
          style={{ flex: 1 }}
          placeholder="New board name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit">Create</button>
      </form>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {loading && <p>Loading...</p>}
      {!loading && boards.length === 0 && <p>No boards yet. Create your first one above.</p>}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {boards.map((board) => (
          <li
            key={board.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          >
            <Link to={`/boards/${board.id}`}>{board.title}</Link>
            <span style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleRename(board)}>Rename</button>
              <button onClick={() => handleDelete(board)}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}