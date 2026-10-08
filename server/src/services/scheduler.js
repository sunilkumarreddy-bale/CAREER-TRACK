import cron from 'node-cron';
import { env } from '../config/env.js';
import { Application, Interview, User } from '../models/index.js';
import { DAY_MS } from '../utils/constants.js';
import { daysSince, followUpFilter } from '../utils/followUp.js';
import { escapeHtml, sendMail } from './mailer.js';

const appLink = (p = '') => (env.APP_URL ? `${env.APP_URL.replace(/\/$/, '')}${p}` : '');

function formatWhen(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: env.SCHEDULER_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Emails a reminder for interviews in the next 24h. Each interview is claimed
 * atomically before sending so several app instances never send duplicates.
 */
export async function sendInterviewReminders(now = new Date()) {
  const users = await User.find({ 'settings.emailReminders': true }).select('_id email name').lean();
  let sent = 0;
  for (const user of users) {
    for (;;) {
      const interview = await Interview.findOneAndUpdate(
        {
          user: user._id,
          reminderSentAt: null,
          outcome: { $ne: 'Cancelled' },
          scheduledAt: { $gte: now, $lte: new Date(now.getTime() + DAY_MS) },
        },
        { $set: { reminderSentAt: now } },
        { new: true },
      ).populate('application', 'company position');
      if (!interview) break;

      const company = interview.application?.company ?? 'your interview';
      const subject = `Reminder: ${interview.round} interview with ${company} – ${formatWhen(interview.scheduledAt)}`;
      const details = [
        `Company: ${company}`,
        `Position: ${interview.application?.position ?? '-'}`,
        `Round: ${interview.round} (${interview.mode})`,
        `When: ${formatWhen(interview.scheduledAt)} (${env.SCHEDULER_TIMEZONE})`,
        interview.location && `Where: ${interview.location}`,
      ].filter(Boolean);
      try {
        await sendMail({
          to: user.email,
          subject,
          text: `Hi ${user.name},\n\nYou have an upcoming interview:\n\n${details.join('\n')}\n\nGood luck!\n${appLink('/interviews')}`,
          html: `<p>Hi ${escapeHtml(user.name)},</p><p>You have an upcoming interview:</p><ul>${details
            .map((d) => `<li>${escapeHtml(d)}</li>`)
            .join('')}</ul><p>Good luck!</p>`,
        });
        sent += 1;
      } catch (err) {
        // Release the claim so the next run retries.
        await Interview.updateOne({ _id: interview._id }, { $set: { reminderSentAt: null } });
        console.error(`Interview reminder failed for ${user.email}:`, err.message);
        break;
      }
    }
  }
  return sent;
}

/** Daily digest of applications waiting on a follow-up, at most once per user per day. */
export async function sendFollowUpDigests(now = new Date()) {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const users = await User.find({ 'settings.emailReminders': true }).select('_id email name settings').lean();
  let sent = 0;
  for (const user of users) {
    const apps = await Application.find(followUpFilter(user._id, user.settings.followUpDays, now.getTime()))
      .sort({ lastActivityAt: 1 })
      .limit(25)
      .select('company position status lastActivityAt')
      .lean();
    if (!apps.length) continue;

    const claimed = await User.findOneAndUpdate(
      { _id: user._id, $or: [{ lastDigestAt: null }, { lastDigestAt: { $lt: startOfDay } }] },
      { $set: { lastDigestAt: now } },
    );
    if (!claimed) continue;

    const lines = apps.map(
      (a) => `${a.company} – ${a.position} (${a.status}): no activity for ${daysSince(a.lastActivityAt, now.getTime())} days`,
    );
    try {
      await sendMail({
        to: user.email,
        subject: apps.length === 1 ? '1 application needs a follow-up' : `${apps.length} applications need a follow-up`,
        text: `Hi ${user.name},\n\nThese applications have had no activity for ${user.settings.followUpDays}+ days:\n\n${lines.join('\n')}\n\n${appLink('/applications?followUp=true')}`,
        html: `<p>Hi ${escapeHtml(user.name)},</p><p>These applications have had no activity for ${
          user.settings.followUpDays
        }+ days:</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
      });
      sent += 1;
    } catch (err) {
      await User.updateOne({ _id: user._id }, { $set: { lastDigestAt: claimed.lastDigestAt } });
      console.error(`Follow-up digest failed for ${user.email}:`, err.message);
    }
  }
  return sent;
}

const tasks = [];

function schedule(expression, name, job) {
  if (!cron.validate(expression)) throw new Error(`Invalid cron expression for ${name}: ${expression}`);
  tasks.push(
    cron.schedule(
      expression,
      () => job().catch((err) => console.error(`[scheduler] ${name} failed:`, err)),
      { timezone: env.SCHEDULER_TIMEZONE, name, noOverlap: true },
    ),
  );
}

export function startScheduler() {
  if (!env.schedulerEnabled) return;
  if (!env.smtpEnabled) {
    console.log('[scheduler] SMTP not configured – email reminders disabled (in-app reminders still work)');
    return;
  }
  schedule(env.INTERVIEW_REMINDER_CRON, 'interview-reminders', sendInterviewReminders);
  schedule(env.FOLLOWUP_DIGEST_CRON, 'follow-up-digest', sendFollowUpDigests);
  console.log('[scheduler] email reminders enabled');
}

export function stopScheduler() {
  for (const t of tasks.splice(0)) t.stop();
}
