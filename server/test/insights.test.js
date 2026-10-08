import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';
import { registeredClient, useTestApp } from './helpers.js';

const ctx = useTestApp('insights');
const DAY = 24 * 60 * 60 * 1000;

async function seed(c) {
  const make = async (company, path) => {
    const app = (await c.post('/api/applications').send({ company, position: 'SDE' })).body.application;
    for (const status of path) await c.patch(`/api/applications/${app.id}/status`).send({ status });
    return app;
  };
  await make('A', []); // Applied
  await make('B', ['Screening']);
  await make('C', ['Screening', 'Interview']);
  await make('D', ['Screening', 'Interview', 'Final Round', 'Offer']);
  await make('E', ['Screening', 'Interview', 'Rejected']); // reached interview, then rejected
  await make('F', ['Rejected']);
  const g = await make('G', ['Interview']);
  return { g };
}

describe('dashboard & analytics', () => {
  it('computes consistent summary numbers', async () => {
    const c = await registeredClient(ctx.app);
    await seed(c);
    const { summary } = (await c.get('/api/dashboard')).body;
    assert.equal(summary.total, 7);
    assert.equal(summary.offers, 1);
    assert.equal(summary.rejections, 2);
    assert.equal(summary.active, 4);
    assert.equal(summary.interviews, 4, 'C, D, E, G reached the interview stage');
    assert.deepEqual(summary.byStatus, { Applied: 1, Screening: 1, Interview: 2, 'Final Round': 0, Offer: 1, Rejected: 2 });
    assert.equal(Object.values(summary.byStatus).reduce((a, b) => a + b, 0), summary.total);
    assert.equal(summary.rates.interview, 57.1);
    assert.equal(summary.rates.offer, 14.3);
    assert.equal(summary.rates.response, 85.7);
  });

  it('returns empty analytics for a new user', async () => {
    const c = await registeredClient(ctx.app);
    const res = await c.get('/api/analytics');
    assert.equal(res.status, 200);
    assert.equal(res.body.summary.total, 0);
    assert.equal(res.body.summary.rates.offer, 0);
    assert.equal(res.body.monthly.length, 6);
    assert.ok(res.body.monthly.every((m) => m.applications === 0));
  });

  it('groups applications by month and reports resume performance', async () => {
    const c = await registeredClient(ctx.app);
    const resume = (
      await c.post('/api/resumes').attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'cv.pdf', contentType: 'application/pdf' })
    ).body.resume;
    await c.post('/api/applications').send({ company: 'A', position: 'X', resume: resume._id, status: 'Interview' });
    await c.post('/api/applications').send({ company: 'B', position: 'X', resume: resume._id });
    const old = new Date();
    old.setUTCMonth(old.getUTCMonth() - 2, 15);
    await c.post('/api/applications').send({ company: 'C', position: 'X', appliedDate: old.toISOString() });

    const { monthly, resumePerformance } = (await c.get('/api/analytics?months=3')).body;
    assert.equal(monthly.length, 3);
    assert.equal(monthly[0].applications, 1);
    assert.equal(monthly[2].applications, 2);
    assert.equal(monthly[2].interviewRate, 50);
    assert.deepEqual(resumePerformance.map((r) => [r.label, r.applications, r.interviews]), [['cv', 2, 1]]);
  });

  it('lists upcoming interviews and follow-ups on the dashboard', async () => {
    const c = await registeredClient(ctx.app);
    const { g } = await seed(c);
    await c.post('/api/interviews').send({ application: g.id, round: 'Technical', scheduledAt: new Date(Date.now() + DAY).toISOString() });
    await c.post('/api/interviews').send({ application: g.id, round: 'HR', scheduledAt: new Date(Date.now() + DAY).toISOString(), outcome: 'Cancelled' });
    await mongoose.model('Application').updateMany({ company: 'A' }, { $set: { lastActivityAt: new Date(Date.now() - 8 * DAY) } });

    const dash = (await c.get('/api/dashboard')).body;
    assert.deepEqual(dash.upcomingInterviews.map((i) => i.round), ['Technical']);
    assert.deepEqual(dash.followUps.map((a) => a.company), ['A']);
    assert.equal(dash.recent.length, 5);

    const reminders = (await c.get('/api/reminders')).body;
    assert.equal(reminders.count, 2);
  });
});
