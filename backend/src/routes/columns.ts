import { Router } from 'express';
import { z } from 'zod';
import { authorizeBoard, authorizeColumn } from '../access';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { parseId } from '../utils';

export const columnsRouter = Router();

const titleSchema = z.object({
  title: z.string().trim().min(1).max(255),
});

const moveSchema = z.object({
  position: z.number().int().min(0),
});

columnsRouter.post('/boards/:boardId/columns', requireAuth, async (req, res) => {
  const boardId = parseId(req.params.boardId);
  if (!boardId) return res.status(400).json({ error: 'Invalid board id' });

  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  try {
    const role = await authorizeBoard(res, boardId, req.userId as number, 'editor');
    if (!role) return;

    const result = await pool.query(
      `INSERT INTO columns (board_id, title, position)
       SELECT $1::int, $2::text, COALESCE(MAX(position) + 1, 0)
       FROM columns WHERE board_id = $1::int
       RETURNING id, board_id, title, position`,
      [boardId, parsed.data.title],
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

columnsRouter.get('/boards/:boardId/columns', requireAuth, async (req, res) => {
  const boardId = parseId(req.params.boardId);
  if (!boardId) return res.status(400).json({ error: 'Invalid board id' });

  try {
    const role = await authorizeBoard(res, boardId, req.userId as number, 'viewer');
    if (!role) return;

    const result = await pool.query(
      `SELECT id, board_id, title, position
       FROM columns WHERE board_id = $1
       ORDER BY position, id`,
      [boardId],
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

columnsRouter.patch('/columns/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid column id' });

  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  try {
    const boardId = await authorizeColumn(res, id, req.userId as number, 'editor');
    if (!boardId) return;

    const result = await pool.query(
      `UPDATE columns SET title = $1 WHERE id = $2
       RETURNING id, board_id, title, position`,
      [parsed.data.title, id],
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

columnsRouter.patch('/columns/:id/move', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid column id' });

  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  const boardId = await authorizeColumn(res, id, req.userId as number, 'editor');
  if (!boardId) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the board row so two moves at once don't mix up positions
    await client.query('SELECT id FROM boards WHERE id = $1 FOR UPDATE', [boardId]);

    const rows = (
      await client.query('SELECT id FROM columns WHERE board_id = $1 ORDER BY position, id', [
        boardId,
      ])
    ).rows;
    const ids: number[] = rows.map((r) => r.id);

    ids.splice(ids.indexOf(id), 1);
    ids.splice(Math.min(parsed.data.position, ids.length), 0, id);

    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE columns SET position = $1 WHERE id = $2', [i, ids[i]]);
    }
    await client.query('COMMIT');

    const result = await client.query(
      'SELECT id, board_id, title, position FROM columns WHERE board_id = $1 ORDER BY position',
      [boardId],
    );
    return res.json(result.rows);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

columnsRouter.delete('/columns/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid column id' });

  try {
    const boardId = await authorizeColumn(res, id, req.userId as number, 'editor');
    if (!boardId) return;

    await pool.query('DELETE FROM columns WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
