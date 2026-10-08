import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { client, registeredClient, useTestApp } from './helpers.js';

const ctx = useTestApp('auth');

describe('auth', () => {
  it('registers, reads the session, and logs out', async () => {
    const c = await registeredClient(ctx.app, { email: 'Alice@Example.com' });
    assert.equal(c.user.email, 'alice@example.com');
    assert.equal(c.user.settings.followUpDays, 7);
    assert.equal(c.user.password, undefined);

    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'alice@example.com');

    assert.equal((await c.post('/api/auth/logout')).status, 204);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  it('sets an httpOnly cookie', async () => {
    const res = await client(ctx.app).post('/api/auth/register').send({ name: 'A', email: 'a@b.co', password: 'Passw0rd!' });
    assert.match(res.headers['set-cookie'][0], /ct_token=.+HttpOnly/i);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await registeredClient(ctx.app, { email: 'dup@example.com' });
    const dup = await client(ctx.app).post('/api/auth/register').send({ name: 'B', email: 'dup@example.com', password: 'Passw0rd!' });
    assert.equal(dup.status, 409);

    const weak = await client(ctx.app).post('/api/auth/register').send({ name: 'B', email: 'b@example.com', password: 'short' });
    assert.equal(weak.status, 400);
    assert.ok(weak.body.details.some((d) => d.field === 'password'));
  });

  it('logs in with correct credentials only', async () => {
    await registeredClient(ctx.app, { email: 'login@example.com' });
    const bad = await client(ctx.app).post('/api/auth/login').send({ email: 'login@example.com', password: 'wrongpass1' });
    assert.equal(bad.status, 401);
    const unknown = await client(ctx.app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrongpass1' });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error, bad.body.error);

    const c = client(ctx.app);
    const ok = await c.post('/api/auth/login').send({ email: 'LOGIN@example.com', password: 'Passw0rd!' });
    assert.equal(ok.status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 200);
  });

  it('rejects operator injection in login', async () => {
    await registeredClient(ctx.app, { email: 'inj@example.com' });
    const res = await client(ctx.app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    assert.equal(res.status, 400);
  });

  it('requires the CSRF header on state-changing requests', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'x@y.co', password: 'x' });
    assert.equal(res.status, 403);
  });

  it('updates profile settings', async () => {
    const c = await registeredClient(ctx.app);
    const res = await c.patch('/api/auth/me').send({ name: 'New Name', settings: { followUpDays: 10, emailReminders: true } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'New Name');
    assert.deepEqual(res.body.user.settings, { followUpDays: 10, emailReminders: true });

    const invalid = await c.patch('/api/auth/me').send({ settings: { followUpDays: 0 } });
    assert.equal(invalid.status, 400);
  });

  it('changing the password invalidates other sessions', async () => {
    const c = await registeredClient(ctx.app, { email: 'pw@example.com' });
    const other = client(ctx.app);
    await other.post('/api/auth/login').send({ email: 'pw@example.com', password: 'Passw0rd!' });

    const wrong = await c.post('/api/auth/change-password').send({ currentPassword: 'nope', newPassword: 'NewPassw0rd' });
    assert.equal(wrong.status, 400);

    const res = await c.post('/api/auth/change-password').send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd' });
    assert.equal(res.status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 200, 'current session is re-issued');
    assert.equal((await other.get('/api/auth/me')).status, 401, 'other sessions are revoked');
  });

  it('deletes the account and all of its data', async () => {
    const c = await registeredClient(ctx.app, { email: 'del@example.com' });
    await c.post('/api/applications').send({ company: 'Acme', position: 'Dev' });
    assert.equal((await c.delete('/api/auth/me').send({ password: 'wrong' })).status, 400);
    assert.equal((await c.delete('/api/auth/me').send({ password: 'Passw0rd!' })).status, 204);
    const login = await client(ctx.app).post('/api/auth/login').send({ email: 'del@example.com', password: 'Passw0rd!' });
    assert.equal(login.status, 401);
  });

  it('reports health', async () => {
    const res = await request(ctx.app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.db, 'connected');
  });
});
