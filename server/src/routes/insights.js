import { Router } from 'express';
import { z } from 'zod';
import { Application, Interview } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { computeAnalytics, computeSummary } from '../services/analytics.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { DAY_MS } from '../utils/constants.js';
import { followUpFilter } from '../utils/followUp.js';
import { serializeApplication } from './applications.js';

const router = Router();

async function followUps(user, limit = 50) {
  const apps = await Application.find(followUpFilter(user._id, user.settings.followUpDays))
    .sort({ lastActivityAt: 1 })
    .limit(limit)
    .select('company position status lastActivityAt appliedDate lastFollowUpAt')
    .lean();
  return apps.map((a) => serializeApplication(a, user.settings.followUpDays));
}

function upcomingInterviews(userId, { withinMs, limit }) {
  const now = new Date();
  const scheduledAt = withinMs ? { $gte: now, $lte: new Date(now.getTime() + withinMs) } : { $gte: now };
  return Interview.find({ user: userId, scheduledAt, outcome: { $ne: 'Cancelled' } })
    .sort({ scheduledAt: 1 })
    .limit(limit)
    .populate('application', 'company position status')
    .lean();
}

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const [summary, interviews, pendingFollowUps, recent] = await Promise.all([
      computeSummary(req.user._id),
      upcomingInterviews(req.user._id, { limit: 5 }),
      followUps(req.user, 5),
      Application.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(5).select('company position status updatedAt').lean(),
    ]);
    res.json({ summary, upcomingInterviews: interviews, followUps: pendingFollowUps, recent });
  }),
);

router.get(
  '/analytics',
  validate({ query: z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }) }),
  asyncHandler(async (req, res) => {
    res.json(await computeAnalytics(req.user._id, req.query.months));
  }),
);

router.get(
  '/reminders',
  asyncHandler(async (req, res) => {
    const [pendingFollowUps, interviews] = await Promise.all([
      followUps(req.user),
      upcomingInterviews(req.user._id, { withinMs: 2 * DAY_MS, limit: 20 }),
    ]);
    res.json({
      followUpDays: req.user.settings.followUpDays,
      followUps: pendingFollowUps,
      upcomingInterviews: interviews,
      count: pendingFollowUps.length + interviews.length,
    });
  }),
);

export default router;
