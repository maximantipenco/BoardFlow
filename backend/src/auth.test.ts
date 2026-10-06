import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app';
import { pool } from './db';

const user = { email: 'vitest@example.com', password: 'password123', name: 'Vitest' };

beforeEach(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [user.email]);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [user.email]);
  await pool.end();
});

describe('auth', () => {
  it('registers a new user without exposing the password hash', async () => {
    const res = await request(app).post('/auth/register').send(user);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(user.email);
    expect(res.body.password_hash).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/auth/register').send(user);
    const res = await request(app).post('/auth/register').send(user);
    expect(res.status).toBe(409);
  });

  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...user, password: '123' });
    expect(res.status).toBe(400);
  });

  it('rejects a wrong password on login', async () => {
    await request(app).post('/auth/register').send(user);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('logs in and returns the profile via /me', async () => {
    await request(app).post('/auth/register').send(user);
    const login = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();

    const me = await request(app).get('/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(user.email);
  });

  it('blocks /me without a token', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });
});
