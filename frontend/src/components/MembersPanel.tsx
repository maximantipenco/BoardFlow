import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Member, Role } from '../types';

type Props = {
  boardId: number;
  isOwner: boolean;
  onClose: () => void;
};

export default function MembersPanel({ boardId, isOwner, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Member[]>(`/boards/${boardId}/members`)
      .then(setMembers)
      .catch((err: Error) => setError(err.message));
  }, [boardId]);

  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : 'Something went wrong');
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const member = await api<Member>(`/boards/${boardId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      setMembers((prev) => [...prev, member]);
      setEmail('');
    } catch (err) {
      fail(err);
    }
  }

  async function changeRole(member: Member, newRole: 'editor' | 'viewer') {
    try {
      await api(`/boards/${boardId}/members/${member.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      setMembers((prev) =>
        prev.map((m) => (m.user_id === member.user_id ? { ...m, role: newRole as Role } : m)),
      );
    } catch (err) {
      fail(err);
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`Remove ${member.email}?`)) return;
    try {
      await api(`/boards/${boardId}/members/${member.user_id}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0006',
        display: 'grid',
        placeItems: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          color: '#222',
          borderRadius: 8,
          padding: 20,
          width: 440,
          maxWidth: '90vw',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Members</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {members.map((m) => (
            <li
              key={m.user_id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
            >
              <span>{m.name ? `${m.name} (${m.email})` : m.email}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                {isOwner && m.role !== 'owner' ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m, e.target.value as 'editor' | 'viewer')}
                    >
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button onClick={() => remove(m)}>Remove</button>
                  </>
                ) : (
                  <em>{m.role}</em>
                )}
              </span>
            </li>
          ))}
        </ul>

        {isOwner && (
          <form onSubmit={invite} style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            <input
              style={{ flex: 1, minWidth: 0 }}
              type="email"
              placeholder="Email of a registered user"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="submit">Invite</button>
          </form>
        )}
      </div>
    </div>
  );
}
