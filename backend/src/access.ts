import { pool } from './db';
import type { Response } from 'express';

export type Role = 'owner' | 'editor' | 'viewer';

const rank: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export function hasRole(actual: Role, required: Role): boolean {
  return rank[actual] >= rank[required];
}

export async function getBoardRole(boardId: number, userId: number): Promise<Role | null> {
  const r = await pool.query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [boardId, userId],
  );
  return r.rows[0]?.role ?? null;
}

export async function getColumnBoardId(columnId: number): Promise<number | null> {
  const r = await pool.query('SELECT board_id FROM columns WHERE id = $1', [columnId]);
  return r.rows[0]?.board_id ?? null;
}

export async function getCardBoardId(cardId: number): Promise<number | null> {
  const r = await pool.query(
    'SELECT c.board_id FROM cards cd JOIN columns c ON c.id = cd.column_id WHERE cd.id = $1',
    [cardId],
  );
  return r.rows[0]?.board_id ?? null;
}

// Checks the user's role on a board. If access is denied, sends the error
// response itself and returns null, so the caller just does `if (!role) return;`
export async function authorizeBoard(
  res: Response,
  boardId: number,
  userId: number,
  required: Role,
): Promise<Role | null> {
  const role = await getBoardRole(boardId, userId);
  if (!role) {
    res.status(404).json({ error: 'Board not found' });
    return null;
  }
  if (!hasRole(role, required)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  return role;
}
