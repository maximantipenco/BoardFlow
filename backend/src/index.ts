import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const result = await pool.query('SELECT now() AS time');
  console.log('Connected to database at', result.rows[0].time);
  await pool.end();
}

main().catch((err) => {
  console.error('Database connection failed:', err.message);
  process.exit(1);
});