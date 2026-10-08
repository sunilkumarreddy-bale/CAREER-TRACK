import { Router } from 'express';
import { z } from 'zod';
import { Application, Interview } from '../models/index.js';
import { idParams, objectId, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { INTERVIEW_MODES, INTERVIEW_OUTCOMES, INTERVIEW_ROUNDS } from '../utils/constants.js';
import { badRequest, notFound } from '../utils/httpError.js';

const router = Router();

const fields = {
  application: objectId,
  round: z.enum(INTERVIEW_ROUNDS),
  scheduledAt: z.coerce.date({ errorMap: () => ({ message: 'Invalid date/time' }) }),
  durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
  mode: z.enum(INTERVIEW_MODES).optional(),
  location: z.string().trim().max(2048).optional(),
  notes: z.string().trim().max(5000).optional(),
  outcome: z.enum(INTERVIEW_OUTCOMES).optional(),
};

const createSchema = z.object(fields).strict();
const updateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const listQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  application: objectId.optional(),
  upcoming: z.enum(['true', 'false']).optional(),
  outcome: z.enum(INTERVIEW_OUTCOMES).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

const POPULATE = { path: 'application', select: 'company position status' };

async function touchApplication(userId, applicationId) {
  const app = await Application.findOneAndUpdate(
    { _id: applicationId, user: userId },
    { $set: { lastActivityAt: new Date() } },
    { new: true },
  );
  if (!app) throw badRequest('Application not found');
  return app;
}

router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { from, to, application, upcoming, outcome, limit } = req.query;
    const filter = { user: req.user._id };
    if (application) filter.application = application;
    if (outcome) filter.outcome = outcome;
    if (from || to || upcoming === 'true') {
      filter.scheduledAt = {};
      if (from) filter.scheduledAt.$gte = from;
      if (to) filter.scheduledAt.$lte = to;
      if (upcoming === 'true') {
        const now = new Date();
        if (!from || from < now) filter.scheduledAt.$gte = now;
        filter.outcome = { $ne: 'Cancelled' };
      }
    }
    const items = await Interview.find(filter).sort({ scheduledAt: 1 }).limit(limit).populate(POPULATE).lean();
    res.json({ items });
  }),
);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    await touchApplication(req.user._id, req.body.application);
    const interview = await Interview.create({ ...req.body, user: req.user._id });
    await interview.populate(POPULATE);
    res.status(201).json({ interview });
  }),
);

router.patch(
  '/:id',
  validate({ params: idParams, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const interview = await Interview.findOne({ _id: req.params.id, user: req.user._id });
    if (!interview) throw notFound('Interview not found');
    if (req.body.application) await touchApplication(req.user._id, req.body.application);
    const rescheduled =
      req.body.scheduledAt && req.body.scheduledAt.getTime() !== interview.scheduledAt.getTime();
    interview.set(req.body);
    if (rescheduled) interview.reminderSentAt = null; // remind again for the new time
    await interview.save();
    await interview.populate(POPULATE);
    res.json({ interview });
  }),
);

router.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const result = await Interview.deleteOne({ _id: req.params.id, user: req.user._id });
    if (!result.deletedCount) throw notFound('Interview not found');
    res.status(204).end();
  }),
);

export default router;
