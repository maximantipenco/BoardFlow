import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app';
import { pool } from './db';

const alice = { email: 'alice-members@example.com', password: 'password123', name: 'Alice' };
const bob = { email: 'bob-members@example.com', password: 'password123', name: 'Bob' };

async function registerAndLogin(user: typeof alice) {
  await request(app).post('/auth/register').send(user);
  const res = await request(app)
    .post('/auth/login')
    .send({ email: user.email, password: user.password });
  return { auth: `Bearer ${res.body.token}`, id: res.body.user.id as number };
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[alice.email, bob.email]]);
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('members', () => {
  it('lets the owner invite a user, who then sees the board', async () => {
    const a = await registerAndLogin(alice);
    const b = await registerAndLogin(bob);
    const board = await request(app)
      .post('/boards')
      .set('Authorization', a.auth)
      .send({ title: 'Shared' });

    const invite = await request(app)
      .post(`/boards/${board.body.id}/members`)
      .set('Authorization', a.auth)
      .send({ email: bob.email, role: 'viewer' });
    expect(invite.status).toBe(201);

    const list = await request(app).get('/boards').set('Authorization', b.auth);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].role).toBe('viewer');

    const full = await request(app)
      .get(`/boards/${board.body.id}/full`)
      .set('Authorization', b.auth);
    expect(full.status).toBe(200);
  });

  it('forbids a viewer from managing the board', async () => {
    const a = await registerAndLogin(alice);
    const b = await registerAndLogin(bob);
    const board = await request(app)
      .post('/boards')
      .set('Authorization', a.auth)
      .send({ title: 'Shared' });
    await request(app)
      .post(`/boards/${board.body.id}/members`)
      .set('Authorization', a.auth)
      .send({ email: bob.email, role: 'viewer' });

    const rename = await request(app)
      .patch(`/boards/${board.body.id}`)
      .set('Authorization', b.auth)
      .send({ title: 'Hacked' });
    expect(rename.status).toBe(403);

    const del = await request(app).delete(`/boards/${board.body.id}`).set('Authorization', b.auth);
    expect(del.status).toBe(403);

    const invite = await request(app)
      .post(`/boards/${board.body.id}/members`)
      .set('Authorization', b.auth)
      .send({ email: alice.email, role: 'editor' });
    expect(invite.status).toBe(403);
  });

  it('rejects duplicates and protects the owner', async () => {
    const a = await registerAndLogin(alice);
    await registerAndLogin(bob);
    const board = await request(app)
      .post('/boards')
      .set('Authorization', a.auth)
      .send({ title: 'Shared' });
    const url = `/boards/${board.body.id}/members`;

    await request(app)
      .post(url)
      .set('Authorization', a.auth)
      .send({ email: bob.email, role: 'editor' });
    const again = await request(app)
      .post(url)
      .set('Authorization', a.auth)
      .send({ email: bob.email, role: 'editor' });
    expect(again.status).toBe(409);

    const removeOwner = await request(app).delete(`${url}/${a.id}`).set('Authorization', a.auth);
    expect(removeOwner.status).toBe(404);
  });

  it('removes access when a member is removed', async () => {
    const a = await registerAndLogin(alice);
    const b = await registerAndLogin(bob);
    const board = await request(app)
      .post('/boards')
      .set('Authorization', a.auth)
      .send({ title: 'Shared' });
    const url = `/boards/${board.body.id}/members`;
    await request(app)
      .post(url)
      .set('Authorization', a.auth)
      .send({ email: bob.email, role: 'editor' });

    const removed = await request(app).delete(`${url}/${b.id}`).set('Authorization', a.auth);
    expect(removed.status).toBe(204);

    const after = await request(app).get(`/boards/${board.body.id}`).set('Authorization', b.auth);
    expect(after.status).toBe(404);
  });
});
