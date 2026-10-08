import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';
import { registeredClient, useTestApp } from './helpers.js';

const ctx = useTestApp('applications');
const DAY = 24 * 60 * 60 * 1000;

describe('applications', () => {
  it('creates, reads, updates and deletes an application', async () => {
    const c = await registeredClient(ctx.app);
    const created = await c.post('/api/applications').send({
      company: 'Google',
      position: 'Backend Engineer',
      salary: '₹8 LPA',
      location: 'Bangalore',
      appliedDate: '2026-09-01',
      jobLink: 'https://careers.google.com/x',
    });
    assert.equal(created.status, 201);
    const app = created.body.application;
    assert.equal(app.status, 'Applied');
    assert.equal(app.statusHistory.length, 1);
    assert.equal(app.needsFollowUp, false);

    const got = await c.get(`/api/applications/${app.id}`);
    assert.equal(got.status, 200);
    assert.deepEqual(got.body.interviews, []);

    const updated = await c.patch(`/api/applications/${app.id}`).send({ status: 'Screening', notes: 'Recruiter called' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.application.status, 'Screening');
    assert.deepEqual(updated.body.application.statusHistory.map((h) => h.status), ['Applied', 'Screening']);

    assert.equal((await c.delete(`/api/applications/${app.id}`)).status, 204);
    assert.equal((await c.get(`/api/applications/${app.id}`)).status, 404);
  });

  it('validates input', async () => {
    const c = await registeredClient(ctx.app);
    const res = await c.post('/api/applications').send({ company: '', position: 'X', status: 'Hired', jobLink: 'javascript:alert(1)' });
    assert.equal(res.status, 400);
    const fields = res.body.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['company', 'jobLink', 'status']);

    assert.equal((await c.post('/api/applications').send({ company: 'A', position: 'B', owner: 'x' })).status, 400);
    assert.equal((await c.get('/api/applications/not-an-id')).status, 400);
    assert.equal((await c.patch(`/api/applications/${new mongoose.Types.ObjectId()}`).send({ notes: 'x' })).status, 404);
  });

  it('isolates data between users', async () => {
    const alice = await registeredClient(ctx.app);
    const bob = await registeredClient(ctx.app);
    const { body } = await alice.post('/api/applications').send({ company: 'Secret', position: 'Dev' });
    const id = body.application.id;

    assert.equal((await bob.get(`/api/applications/${id}`)).status, 404);
    assert.equal((await bob.patch(`/api/applications/${id}`).send({ notes: 'x' })).status, 404);
    assert.equal((await bob.delete(`/api/applications/${id}`)).status, 404);
    assert.equal((await bob.get('/api/applications')).body.total, 0);
  });

  it('searches, filters, sorts and paginates', async () => {
    const c = await registeredClient(ctx.app);
    const rows = [
      ['Google', 'Backend Engineer', 'Bangalore', 'Interview', '2026-09-01'],
      ['Zoho', 'Developer', 'Chennai', 'Applied', '2026-09-02'],
      ['TCS', 'SDE Intern', 'Hyderabad', 'Applied', '2026-09-03'],
      ['Amazon', 'SDE', 'Hyderabad', 'Rejected', '2026-09-04'],
      ['Infosys (India)', 'Developer', 'Mysore', 'Screening', '2026-09-05'],
    ];
    for (const [company, position, location, status, appliedDate] of rows) {
      await c.post('/api/applications').send({ company, position, location, status, appliedDate });
    }

    const q = async (qs) => (await c.get(`/api/applications?${qs}`)).body;
    assert.deepEqual((await q('q=goo')).items.map((a) => a.company), ['Google']);
    assert.equal((await q('q=(India)')).total, 1, 'regex characters are escaped');
    assert.equal((await q('q=developer')).total, 2);
    assert.equal((await q('status=Applied')).total, 2);
    assert.equal((await q('status=Applied,Rejected')).total, 3);
    assert.equal((await q('location=hyderabad')).total, 2);
    assert.equal((await q('position=Developer&location=Chennai')).total, 1);
    assert.deepEqual((await q('sort=appliedDate&limit=2')).items.map((a) => a.company), ['Google', 'Zoho']);
    const page3 = await q('sort=appliedDate&limit=2&page=3');
    assert.deepEqual(page3.items.map((a) => a.company), ['Infosys (India)']);
    assert.equal(page3.pages, 3);
    assert.equal((await c.get('/api/applications?status=Hired')).status, 400);

    const filters = (await c.get('/api/applications/filters')).body;
    assert.deepEqual(filters.locations, ['Bangalore', 'Chennai', 'Hyderabad', 'Mysore']);
  });

  it('records the status history through the status endpoint', async () => {
    const c = await registeredClient(ctx.app);
    const { body } = await c.post('/api/applications').send({ company: 'Google', position: 'SDE' });
    const id = body.application.id;
    for (const status of ['Screening', 'Interview', 'Interview', 'Final Round', 'Offer']) {
      const res = await c.patch(`/api/applications/${id}/status`).send({ status });
      assert.equal(res.status, 200);
    }
    const final = (await c.get(`/api/applications/${id}`)).body.application;
    assert.deepEqual(final.statusHistory.map((h) => h.status), ['Applied', 'Screening', 'Interview', 'Final Round', 'Offer']);
  });

  it('flags and clears follow-ups', async () => {
    const c = await registeredClient(ctx.app);
    const stale = (await c.post('/api/applications').send({ company: 'Infosys', position: 'Dev' })).body.application;
    await c.post('/api/applications').send({ company: 'Fresh', position: 'Dev' });
    const closed = (await c.post('/api/applications').send({ company: 'Closed', position: 'Dev', status: 'Rejected' })).body.application;

    const Application = mongoose.model('Application');
    const nineDaysAgo = new Date(Date.now() - 9 * DAY);
    await Application.updateMany({ _id: { $in: [stale.id, closed.id] } }, { $set: { lastActivityAt: nineDaysAgo } });

    const list = (await c.get('/api/applications?followUp=true')).body;
    assert.deepEqual(list.items.map((a) => a.company), ['Infosys']);
    assert.equal(list.items[0].daysSinceActivity, 9);
    assert.equal(list.items[0].needsFollowUp, true);

    const reminders = (await c.get('/api/reminders')).body;
    assert.equal(reminders.followUps.length, 1);

    const done = await c.post(`/api/applications/${stale.id}/follow-up`);
    assert.equal(done.body.application.needsFollowUp, false);
    assert.ok(done.body.application.lastFollowUpAt);
    assert.equal((await c.get('/api/applications?followUp=true')).body.total, 0);

    // A longer threshold hides it too.
    await Application.updateOne({ _id: stale.id }, { $set: { lastActivityAt: nineDaysAgo } });
    await c.patch('/api/auth/me').send({ settings: { followUpDays: 14 } });
    assert.equal((await c.get('/api/applications?followUp=true')).body.total, 0);
  });

  it('exports CSV with formula injection neutralised', async () => {
    const c = await registeredClient(ctx.app);
    await c.post('/api/applications').send({ company: '=HYPERLINK("x")', position: 'Dev, "Senior"' });
    const res = await c.get('/api/applications/export');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.ok(res.text.includes(`"'=HYPERLINK(""x"")"`));
    assert.ok(res.text.includes('"Dev, ""Senior"""'));
  });

  it('requires authentication', async () => {
    const { default: request } = await import('supertest');
    assert.equal((await request(ctx.app).get('/api/applications')).status, 401);
    assert.equal((await request(ctx.app).get('/api/dashboard')).status, 401);
  });
});
