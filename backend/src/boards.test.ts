import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app';
import { pool } from './db';

const alice = { email: 'alice-boards@example.com', password: 'password123', name: 'Alice' };
const bob = { email: 'bob-boards@example.com', password: 'password123', name: 'Bob' };

async function registerAndLogin(user: typeof alice) {
  await request(app).post('/auth/register').send(user);
  const res = await request(app)
    .post('/auth/login')
    .send({ email: user.email, password: user.password });
  return `Bearer ${res.body.token}`;
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[alice.email, bob.email]]);
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('boards', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/boards');
    expect(res.status).toBe(401);
  });

  it('creates and lists own boards', async () => {
    const auth = await registerAndLogin(alice);
    const created = await request(app)
      .post('/boards')
      .set('Authorization', auth)
      .send({ title: 'Alice board' });
    expect(created.status).toBe(201);

    const list = await request(app).get('/boards').set('Authorization', auth);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('Alice board');
  });

  it('hides other users boards', async () => {
    const aliceAuth = await registerAndLogin(alice);
    const bobAuth = await registerAndLogin(bob);

    const created = await request(app)
      .post('/boards')
      .set('Authorization', aliceAuth)
      .send({ title: 'Private' });
    const id = created.body.id;

    const bobList = await request(app).get('/boards').set('Authorization', bobAuth);
    expect(bobList.body).toHaveLength(0);

    const bobGet = await request(app).get(`/boards/${id}`).set('Authorization', bobAuth);
    expect(bobGet.status).toBe(404);

    const bobDelete = await request(app).delete(`/boards/${id}`).set('Authorization', bobAuth);
    expect(bobDelete.status).toBe(404);

    const stillThere = await request(app).get(`/boards/${id}`).set('Authorization', aliceAuth);
    expect(stillThere.status).toBe(200);
  });
});
