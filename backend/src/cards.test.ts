import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app';
import { pool } from './db';

const alice = { email: 'alice-cards@example.com', password: 'password123', name: 'Alice' };
const bob = { email: 'bob-cards@example.com', password: 'password123', name: 'Bob' };

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
  return res.body.id as number;
}

async function createCard(auth: string, columnId: number, title: string) {
  const res = await request(app)
    .post(`/columns/${columnId}/cards`)
    .set('Authorization', auth)
    .send({ title });
  return res.body;
}

async function titles(auth: string, columnId: number) {
  const res = await request(app).get(`/columns/${columnId}/cards`).set('Authorization', auth);
  return res.body.map((c: { title: string }) => c.title);
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[alice.email, bob.email]]);
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('cards', () => {
  it('creates cards in order and updates them', async () => {
    const auth = await registerAndLogin(alice);
    const columnId = await createColumn(auth, await createBoard(auth), 'To Do');

    const a = await createCard(auth, columnId, 'A');
    const b = await createCard(auth, columnId, 'B');
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);

    const updated = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Authorization', auth)
      .send({ description: 'Details' });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('A');
    expect(updated.body.description).toBe('Details');
  });

  it('moves a card within a column', async () => {
    const auth = await registerAndLogin(alice);
    const columnId = await createColumn(auth, await createBoard(auth), 'To Do');
    await createCard(auth, columnId, 'A');
    await createCard(auth, columnId, 'B');
    const c = await createCard(auth, columnId, 'C');

    const moved = await request(app)
      .patch(`/cards/${c.id}/move`)
      .set('Authorization', auth)
      .send({ columnId, position: 0 });
    expect(moved.status).toBe(200);
    expect(await titles(auth, columnId)).toEqual(['C', 'A', 'B']);
  });

  it('moves a card to another column and renumbers both', async () => {
    const auth = await registerAndLogin(alice);
    const boardId = await createBoard(auth);
    const todo = await createColumn(auth, boardId, 'To Do');
    const done = await createColumn(auth, boardId, 'Done');
    const a = await createCard(auth, todo, 'A');
    await createCard(auth, todo, 'B');
    await createCard(auth, done, 'X');

    const moved = await request(app)
      .patch(`/cards/${a.id}/move`)
      .set('Authorization', auth)
      .send({ columnId: done, position: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.column_id).toBe(done);

    expect(await titles(auth, todo)).toEqual(['B']);
    expect(await titles(auth, done)).toEqual(['A', 'X']);
  });

  it('does not let other users touch cards', async () => {
    const aliceAuth = await registerAndLogin(alice);
    const bobAuth = await registerAndLogin(bob);
    const columnId = await createColumn(aliceAuth, await createBoard(aliceAuth), 'Private');
    const card = await createCard(aliceAuth, columnId, 'Secret');

    const bobColumn = await createColumn(bobAuth, await createBoard(bobAuth), 'Bob column');

    const create = await request(app)
      .post(`/columns/${columnId}/cards`)
      .set('Authorization', bobAuth)
      .send({ title: 'Hack' });
    expect(create.status).toBe(404);

    const edit = await request(app)
      .patch(`/cards/${card.id}`)
      .set('Authorization', bobAuth)
      .send({ title: 'Hacked' });
    expect(edit.status).toBe(404);

    const move = await request(app)
      .patch(`/cards/${card.id}/move`)
      .set('Authorization', bobAuth)
      .send({ columnId: bobColumn, position: 0 });
    expect(move.status).toBe(404);

    const del = await request(app).delete(`/cards/${card.id}`).set('Authorization', bobAuth);
    expect(del.status).toBe(404);
  });

  it('refuses to move a card into a column on another board', async () => {
    const aliceAuth = await registerAndLogin(alice);
    const bobAuth = await registerAndLogin(bob);
    const aliceColumn = await createColumn(aliceAuth, await createBoard(aliceAuth), 'Mine');
    const card = await createCard(aliceAuth, aliceColumn, 'Mine');
    const bobColumn = await createColumn(bobAuth, await createBoard(bobAuth), 'Bob');

    const res = await request(app)
      .patch(`/cards/${card.id}/move`)
      .set('Authorization', aliceAuth)
      .send({ columnId: bobColumn, position: 0 });
    expect(res.status).toBe(404);
    expect(await titles(aliceAuth, aliceColumn)).toEqual(['Mine']);
  });

  it('deletes a card', async () => {
    const auth = await registerAndLogin(alice);
    const columnId = await createColumn(auth, await createBoard(auth), 'To Do');
    const card = await createCard(auth, columnId, 'Temp');

    const del = await request(app).delete(`/cards/${card.id}`).set('Authorization', auth);
    expect(del.status).toBe(204);
    expect(await titles(auth, columnId)).toEqual([]);
  });
});
