import express from 'express';
import { pool } from './db';
import { authRouter } from './routes/auth';

export const app = express();

app.use(express.json());
app.use('/auth', authRouter);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', database: 'unavailable' });
  }
});
