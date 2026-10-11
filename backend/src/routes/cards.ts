import { Router } from 'express';
import { z } from 'zod';
import { authorizeCard, authorizeColumn } from '../access';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { parseId } from '../utils';
import { notifyBoard } from '../realtime';

export const cardsRouter = Router();

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10000).nullable().optional(),
  })
  .refine((d) => d.title !== undefined || d.description !== undefined, {
    message: 'Provide title or description',
  });

const moveSchema = z.object({
  columnId: z.number().int().positive(),
  position: z.number().int().min(0),
});

cardsRouter.post('/columns/:columnId/cards', requireAuth, async (req, res) => {
  const columnId = parseId(req.params.columnId);
  if (!columnId) return res.status(400).json({ error: 'Invalid column id' });

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  try {
    const boardId = await authorizeColumn(res, columnId, req.userId as number, 'editor');
    if (!boardId) return;

    const result = await pool.query(
      `INSERT INTO cards (column_id, title, description, position)
       SELECT $1::int, $2::text, $3::text, COALESCE(MAX(position) + 1, 0)
       FROM cards WHERE column_id = $1::int
       RETURNING id, column_id, title, description, position, created_at`,
      [columnId, parsed.data.title, parsed.data.description ?? null],
    );
    notifyBoard(boardId);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

cardsRouter.get('/columns/:columnId/cards', requireAuth, async (req, res) => {
  const columnId = parseId(req.params.columnId);
  if (!columnId) return res.status(400).json({ error: 'Invalid column id' });

  try {
    const boardId = await authorizeColumn(res, columnId, req.userId as number, 'viewer');
    if (!boardId) return;

    const result = await pool.query(
      `SELECT id, column_id, title, description, position, created_at
       FROM cards WHERE column_id = $1
       ORDER BY position, id`,
      [columnId],
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

cardsRouter.patch('/cards/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid card id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  const { title, description } = parsed.data;

  try {
    const boardId = await authorizeCard(res, id, req.userId as number, 'editor');
    if (!boardId) return;

    const result = await pool.query(
      `UPDATE cards SET
         title = COALESCE($1::text, title),
         description = CASE WHEN $2::boolean THEN $3::text ELSE description END
       WHERE id = $4
       RETURNING id, column_id, title, description, position, created_at`,
      [title ?? null, description !== undefined, description ?? null, id],
    );
    notifyBoard(boardId);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

cardsRouter.patch('/cards/:id/move', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid card id' });

  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }
  const { columnId: targetColumnId, position } = parsed.data;

  const boardId = await authorizeCard(res, id, req.userId as number, 'editor');
  if (!boardId) return;

  const client = await pool.connect();
  try {
    const sourceRow = await client.query('SELECT column_id FROM cards WHERE id = $1', [id]);
    const sourceColumnId: number = sourceRow.rows[0].column_id;

    // The target column must be on the same board
    const target = await client.query('SELECT id FROM columns WHERE id = $1 AND board_id = $2', [
      targetColumnId,
      boardId,
    ]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'Target column not found' });
    }

    await client.query('BEGIN');
    await client.query('SELECT id FROM boards WHERE id = $1 FOR UPDATE', [boardId]);

    const sourceIds: number[] = (
      await client.query('SELECT id FROM cards WHERE column_id = $1 ORDER BY position, id', [
        sourceColumnId,
      ])
    ).rows.map((r) => r.id);
    sourceIds.splice(sourceIds.indexOf(id), 1);

    let targetIds: number[];
    if (targetColumnId === sourceColumnId) {
      targetIds = sourceIds;
    } else {
      targetIds = (
        await client.query('SELECT id FROM cards WHERE column_id = $1 ORDER BY position, id', [
          targetColumnId,
        ])
      ).rows.map((r) => r.id);
    }
    targetIds.splice(Math.min(position, targetIds.length), 0, id);

    if (targetColumnId !== sourceColumnId) {
      for (let i = 0; i < sourceIds.length; i++) {
        await client.query('UPDATE cards SET position = $1 WHERE id = $2', [i, sourceIds[i]]);
      }
    }
    for (let i = 0; i < targetIds.length; i++) {
      await client.query('UPDATE cards SET position = $1, column_id = $2 WHERE id = $3', [
        i,
        targetColumnId,
        targetIds[i],
      ]);
    }
    await client.query('COMMIT');
    notifyBoard(boardId);

    const result = await client.query(
      `SELECT id, column_id, title, description, position, created_at
       FROM cards WHERE id = $1`,
      [id],
    );
    return res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

cardsRouter.delete('/cards/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid card id' });

  try {
    const boardId = await authorizeCard(res, id, req.userId as number, 'editor');
    if (!boardId) return;

    await pool.query('DELETE FROM cards WHERE id = $1', [id]);
    notifyBoard(boardId);
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
