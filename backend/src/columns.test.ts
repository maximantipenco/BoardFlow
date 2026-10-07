import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app';
import { pool } from './db';

const alice = { email: 'alice-columns@example.com', password: 'password123', name: 'Alice' };
const bob = { email: 'bob-columns@example.com', password: 'password123', name: 'Bob' };

async function registerAndLogin(user: typeof alice) {
  await request(app).post('/auth/register').send(user);
  const res = await request(app)
    .post('/auth/login')
    .send({ email: user.email, password: user.password });
  return `Bearer ${res.body.token}`;
}

async function createBoard(auth: string) {
  const res = await request(app).post('/boards').set('Authorization', auth).send({ title: 'B' });
  return res.body.id as number;
}

async function createColumn(auth: string, boardId: number, title: string) {
  const res = await request(app)
    .post(`/boards/${boardId}/columns`)
    .set('Authorization', auth)
    .send({ title });
  return res.body;
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[alice.email, bob.email]]);
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('columns', () => {
  it('creates columns in order', async () => {
    const auth = await registerAndLogin(alice);
    const boardId = await createBoard(auth);

    const a = await createColumn(auth, boardId, 'To Do');
    const b = await createColumn(auth, boardId, 'Done');
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it('moves a column to a new position', async () => {
    const auth = await registerAndLogin(alice);
    const boardId = await createBoard(auth);
    await createColumn(auth, boardId, 'A');
    await createColumn(auth, boardId, 'B');
    const c = await createColumn(auth, boardId, 'C');

    const moved = await request(app)
      .patch(`/columns/${c.id}/move`)
      .set('Authorization', auth)
      .send({ position: 0 });
    expect(moved.status).toBe(200);

    const list = await request(app).get(`/boards/${boardId}/columns`).set('Authorization', auth);
    expect(list.body.map((col: { title: string }) => col.title)).toEqual(['C', 'A', 'B']);
  });

  it('does not let other users touch columns', async () => {
    const aliceAuth = await registerAndLogin(alice);
    const bobAuth = await registerAndLogin(bob);
    const boardId = await createBoard(aliceAuth);
    const column = await createColumn(aliceAuth, boardId, 'Private');

    const create = await request(app)
      .post(`/boards/${boardId}/columns`)
      .set('Authorization', bobAuth)
      .send({ title: 'Hack' });
    expect(create.status).toBe(404);

    const list = await request(app).get(`/boards/${boardId}/columns`).set('Authorization', bobAuth);
    expect(list.status).toBe(404);

    const rename = await request(app)
      .patch(`/columns/${column.id}`)
      .set('Authorization', bobAuth)
      .send({ title: 'Hacked' });
    expect(rename.status).toBe(404);

    const move = await request(app)
      .patch(`/columns/${column.id}/move`)
      .set('Authorization', bobAuth)
      .send({ position: 0 });
    expect(move.status).toBe(404);

    const del = await request(app).delete(`/columns/${column.id}`).set('Authorization', bobAuth);
    expect(del.status).toBe(404);
  });

  it('deletes a column', async () => {
    const auth = await registerAndLogin(alice);
    const boardId = await createBoard(auth);
    const column = await createColumn(auth, boardId, 'Temp');

    const del = await request(app).delete(`/columns/${column.id}`).set('Authorization', auth);
    expect(del.status).toBe(204);

    const list = await request(app).get(`/boards/${boardId}/columns`).set('Authorization', auth);
    expect(list.body).toHaveLength(0);
  });
});
