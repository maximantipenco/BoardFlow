import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';

export const meRouter = Router();

meRouter.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [
      req.userId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
