import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { registeredClient, useTestApp } from './helpers.js';

const ctx = useTestApp('interviews');
const DAY = 24 * 60 * 60 * 1000;

async function withApplication(c, company = 'Google') {
  return (await c.post('/api/applications').send({ company, position: 'SDE', status: 'Interview' })).body.application;
}

describe('interviews', () => {
  it('schedules, lists, updates and deletes interviews', async () => {
    const c = await registeredClient(ctx.app);
    const app = await withApplication(c);
    const when = new Date(Date.now() + 3 * DAY);

    const created = await c.post('/api/interviews').send({ application: app.id, round: 'Final', scheduledAt: when.toISOString(), mode: 'Online' });
    assert.equal(created.status, 201);
    assert.equal(created.body.interview.application.company, 'Google');

    const past = await c.post('/api/interviews').send({ application: app.id, round: 'Technical', scheduledAt: new Date(Date.now() - DAY).toISOString() });
    assert.equal(past.status, 201);

    assert.equal((await c.get('/api/interviews')).body.items.length, 2);
    const upcoming = (await c.get('/api/interviews?upcoming=true')).body.items;
    assert.deepEqual(upcoming.map((i) => i.round), ['Final']);

    const from = new Date(Date.now() - 2 * DAY).toISOString();
    const to = new Date(Date.now() + 2 * DAY).toISOString();
    assert.equal((await c.get(`/api/interviews?from=${from}&to=${to}`)).body.items.length, 1);

    const detail = (await c.get(`/api/applications/${app.id}`)).body;
    assert.equal(detail.interviews.length, 2);

    const id = created.body.interview._id;
    const upd = await c.patch(`/api/interviews/${id}`).send({ outcome: 'Passed', notes: 'Went well' });
    assert.equal(upd.body.interview.outcome, 'Passed');

    assert.equal((await c.delete(`/api/interviews/${id}`)).status, 204);
    assert.equal((await c.delete(`/api/interviews/${id}`)).status, 404);
  });

  it('rejects interviews for other users\' applications', async () => {
    const alice = await registeredClient(ctx.app);
    const bob = await registeredClient(ctx.app);
    const app = await withApplication(alice);
    const res = await bob.post('/api/interviews').send({ application: app.id, round: 'HR', scheduledAt: new Date().toISOString() });
    assert.equal(res.status, 400);
  });

  it('validates fields', async () => {
    const c = await registeredClient(ctx.app);
    const app = await withApplication(c);
    const res = await c.post('/api/interviews').send({ application: app.id, round: 'Coffee', scheduledAt: 'tomorrow-ish' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details.map((d) => d.field).sort(), ['round', 'scheduledAt']);
  });

  it('removes interviews when the application is deleted', async () => {
    const c = await registeredClient(ctx.app);
    const app = await withApplication(c);
    await c.post('/api/interviews').send({ application: app.id, round: 'HR', scheduledAt: new Date().toISOString() });
    await c.delete(`/api/applications/${app.id}`);
    assert.equal((await c.get('/api/interviews')).body.items.length, 0);
  });

  it('resets the reminder flag when rescheduled', async () => {
    const c = await registeredClient(ctx.app);
    const app = await withApplication(c);
    const { body } = await c.post('/api/interviews').send({ application: app.id, round: 'HR', scheduledAt: new Date(Date.now() + DAY).toISOString() });
    const { Interview } = await import('../src/models/index.js');
    await Interview.updateOne({ _id: body.interview._id }, { $set: { reminderSentAt: new Date() } });
    await c.patch(`/api/interviews/${body.interview._id}`).send({ scheduledAt: new Date(Date.now() + 2 * DAY).toISOString() });
    assert.equal((await Interview.findById(body.interview._id)).reminderSentAt, null);
  });
});
