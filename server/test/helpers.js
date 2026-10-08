import { after, before, beforeEach } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
const base = process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017';

/** Boots the app against an isolated database for one test file. */
export function useTestApp(name) {
  const ctx = {};
  process.env.MONGODB_URI = `${base.replace(/\/$/, '')}/careertrack_test_${name}_${process.pid}`;

  before(async () => {
    const { connectDB } = await import('../src/config/db.js');
    const { createApp } = await import('../src/app.js');
    await connectDB(process.env.MONGODB_URI);
    ctx.app = createApp();
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  return ctx;
}

const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

/** Supertest agent that keeps the auth cookie and sends the CSRF header. */
export function client(app) {
  const agent = request.agent(app);
  const wrap = (method) => (url) => agent[method](url).set(XHR);
  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), delete: wrap('delete'), raw: agent };
}

export async function registeredClient(app, overrides = {}) {
  const c = client(app);
  const body = { name: 'Test User', email: `user${Math.random().toString(36).slice(2)}@example.com`, password: 'Passw0rd!', ...overrides };
  const res = await c.post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return Object.assign(c, { user: res.body.user, credentials: body });
}
