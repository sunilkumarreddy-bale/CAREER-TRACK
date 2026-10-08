import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import mongoose from 'mongoose';
import { registeredClient, useTestApp } from './helpers.js';

process.env.SMTP_HOST = 'smtp.test.local';
const ctx = useTestApp('scheduler');
const DAY = 24 * 60 * 60 * 1000;

describe('email reminders', () => {
  it('sends each interview reminder once and a daily follow-up digest', async () => {
    const nodemailer = (await import('nodemailer')).default;
    const sent = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (m) => sent.push(m) }));
    const { sendInterviewReminders, sendFollowUpDigests } = await import('../src/services/scheduler.js');

    const optedIn = await registeredClient(ctx.app, { email: 'on@example.com' });
    await optedIn.patch('/api/auth/me').send({ settings: { emailReminders: true } });
    const optedOut = await registeredClient(ctx.app, { email: 'off@example.com' });

    for (const c of [optedIn, optedOut]) {
      const app = (await c.post('/api/applications').send({ company: '<Acme>', position: 'SDE' })).body.application;
      await c.post('/api/interviews').send({ application: app.id, round: 'HR', scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString() });
      await c.post('/api/interviews').send({ application: app.id, round: 'Final', scheduledAt: new Date(Date.now() + 3 * DAY).toISOString() });
    }

    assert.equal(await sendInterviewReminders(), 1);
    assert.equal(await sendInterviewReminders(), 0, 'not sent twice');
    assert.equal(sent[0].to, 'on@example.com');
    assert.match(sent[0].subject, /HR interview with <Acme>/);
    assert.ok(sent[0].html.includes('&lt;Acme&gt;'), 'HTML is escaped');

    await mongoose.model('Application').updateMany({}, { $set: { lastActivityAt: new Date(Date.now() - 10 * DAY) } });
    assert.equal(await sendFollowUpDigests(), 1);
    assert.equal(await sendFollowUpDigests(), 0, 'once per day');
    assert.match(sent[1].subject, /1 application needs a follow-up/);
  });
});
