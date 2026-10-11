import { Router } from 'express';
import { z } from 'zod';
import { authorizeBoard } from '../access';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { parseId } from '../utils';
import { notifyBoard } from '../realtime';

export const boardsRouter = Router();

boardsRouter.use(requireAuth);

const boardSchema = z.object({
  title: z.string().trim().min(1).max(255),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']),
});

const roleSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

// Create a board; the creator becomes its owner (both inserts or none)
boardsRouter.post('/', async (req, res) => {
  const parsed = boardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const board = await client.query(
      `INSERT INTO boards (title, owner_id)
       VALUES ($1, $2)
       RETURNING id, title, owner_id, created_at`,
      [parsed.data.title, req.userId],
    );
    await client.query(
      `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [board.rows[0].id, req.userId],
    );
    await client.query('COMMIT');
    return res.status(201).json({ ...board.rows[0], role: 'owner' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// List every board the user is a member of, with their role
boardsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.title, b.owner_id, b.created_at, m.role
       FROM boards b
       JOIN board_members m ON m.board_id = b.id
       WHERE m.user_id = $1
       ORDER BY b.created_at DESC`,
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
    const role = await authorizeBoard(res, id, req.userId as number, 'viewer');
    if (!role) return;

    const result = await pool.query(
      'SELECT id, title, owner_id, created_at FROM boards WHERE id = $1',
      [id],
    );
    return res.json({ ...result.rows[0], role });
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
    const role = await authorizeBoard(res, id, req.userId as number, 'viewer');
    if (!role) return;

    const board = await pool.query(
      'SELECT id, title, owner_id, created_at FROM boards WHERE id = $1',
      [id],
    );
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

    return res.json({
      ...board.rows[0],
      role,
      columns: columns.rows.map((col) => ({
        ...col,
        cards: cards.rows.filter((card) => card.column_id === col.id),
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Rename: owner only
boardsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid board id' });

  const parsed = boardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  try {
    const role = await authorizeBoard(res, id, req.userId as number, 'owner');
    if (!role) return;

    const result = await pool.query(
      `UPDATE boards SET title = $1 WHERE id = $2
       RETURNING id, title, owner_id, created_at`,
      [parsed.data.title, id],
    );
    notifyBoard(id);
    return res.json({ ...result.rows[0], role });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete: owner only
boardsRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid board id' });

  try {
    const role = await authorizeBoard(res, id, req.userId as number, 'owner');
    if (!role) return;

    await pool.query('DELETE FROM boards WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- Members ----

boardsRouter.get('/:id/members', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid board id' });

  try {
    const role = await authorizeBoard(res, id, req.userId as number, 'viewer');
    if (!role) return;

    const result = await pool.query(
      `SELECT u.id AS user_id, u.email, u.name, m.role
       FROM board_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.board_id = $1
       ORDER BY m.created_at`,
      [id],
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Invite an existing user by email: owner only
boardsRouter.post('/:id/members', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid board id' });

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  try {
    const role = await authorizeBoard(res, id, req.userId as number, 'owner');
    if (!role) return;

    const user = await pool.query('SELECT id, email, name FROM users WHERE email = $1', [
      parsed.data.email.toLowerCase(),
    ]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'No user with this email' });
    }

    const inserted = await pool.query(
      `INSERT INTO board_members (board_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (board_id, user_id) DO NOTHING
       RETURNING user_id`,
      [id, user.rows[0].id, parsed.data.role],
    );
    if (inserted.rows.length === 0) {
      return res.status(409).json({ error: 'User is already a member' });
    }

    notifyBoard(id);
    return res
      .status(201)
      .json({ user_id: user.rows[0].id, ...user.rows[0], role: parsed.data.role });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Change a member's role: owner only (the owner's own role is fixed)
boardsRouter.patch('/:id/members/:userId', async (req, res) => {
  const id = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (!id || !userId) return res.status(400).json({ error: 'Invalid id' });

  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
  }

  try {
    const role = await authorizeBoard(res, id, req.userId as number, 'owner');
    if (!role) return;

    const result = await pool.query(
      `UPDATE board_members SET role = $1
       WHERE board_id = $2 AND user_id = $3 AND role <> 'owner'
       RETURNING user_id, role`,
      [parsed.data.role, id, userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    notifyBoard(id);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove a member: owner removes anyone except the owner; a member can remove themselves
boardsRouter.delete('/:id/members/:userId', async (req, res) => {
  const id = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (!id || !userId) return res.status(400).json({ error: 'Invalid id' });

  try {
    const isSelf = userId === req.userId;
    const role = await authorizeBoard(res, id, req.userId as number, isSelf ? 'viewer' : 'owner');
    if (!role) return;

    const result = await pool.query(
      `DELETE FROM board_members
       WHERE board_id = $1 AND user_id = $2 AND role <> 'owner'`,
      [id, userId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
