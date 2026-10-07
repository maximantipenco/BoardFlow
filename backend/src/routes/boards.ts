import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { parseId } from '../utils';

export const boardsRouter = Router();

boardsRouter.use(requireAuth);

const boardSchema = z.object({
  title: z.string().trim().min(1).max(255),
});

boardsRouter.post('/', async (req, res) => {
  const parsed = boardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  try {
    const result = await pool.query(
      `INSERT INTO boards (title, owner_id)
       VALUES ($1, $2)
       RETURNING id, title, owner_id, created_at`,
      [parsed.data.title, req.userId],
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

boardsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, owner_id, created_at
       FROM boards
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [req.userId],
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

boardsRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid board id' });

  try {
    const result = await pool.query(
      `SELECT id, title, owner_id, created_at
       FROM boards
       WHERE id = $1 AND owner_id = $2`,
      [id, req.userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

boardsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid board id' });

  const parsed = boardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  try {
    const result = await pool.query(
      `UPDATE boards SET title = $1
       WHERE id = $2 AND owner_id = $3
       RETURNING id, title, owner_id, created_at`,
      [parsed.data.title, id, req.userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

boardsRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid board id' });

  try {
    const result = await pool.query('DELETE FROM boards WHERE id = $1 AND owner_id = $2', [
      id,
      req.userId,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Full board: columns with their cards, in 3 queries
boardsRouter.get('/:id/full', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid board id' });

  try {
    const board = await pool.query(
      'SELECT id, title, owner_id, created_at FROM boards WHERE id = $1 AND owner_id = $2',
      [id, req.userId],
    );
    if (board.rows.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const columns = await pool.query(
      'SELECT id, board_id, title, position FROM columns WHERE board_id = $1 ORDER BY position, id',
      [id],
    );
    const cards = await pool.query(
      `SELECT cd.id, cd.column_id, cd.title, cd.description, cd.position, cd.created_at
       FROM cards cd
       JOIN columns c ON c.id = cd.column_id
       WHERE c.board_id = $1
       ORDER BY cd.position, cd.id`,
      [id],
    );

    const result = {
      ...board.rows[0],
      columns: columns.rows.map((col) => ({
        ...col,
        cards: cards.rows.filter((card) => card.column_id === col.id),
      })),
    };
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
