import { Router } from 'express';
import { z } from 'zod';
import { Application, Interview, Resume } from '../models/index.js';
import { idParams, objectId, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ACTIVE_STATUSES, STATUSES } from '../utils/constants.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { daysSince, followUpFilter } from '../utils/followUp.js';
import { badRequest, notFound } from '../utils/httpError.js';

const router = Router();

const optionalText = (max) => z.string().trim().max(max).optional();
const jobLink = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Job link must be an http(s) URL')
  .optional();

const baseFields = {
  company: z.string().trim().min(1, 'Company is required').max(120),
  position: z.string().trim().min(1, 'Position is required').max(120),
  jobLink,
  salary: optionalText(60),
  location: optionalText(120),
  appliedDate: z.coerce.date({ errorMap: () => ({ message: 'Invalid applied date' }) }).optional(),
  status: z.enum(STATUSES).optional(),
  notes: optionalText(5000),
  resume: objectId.nullable().optional(),
};

const createSchema = z.object(baseFields).strict();
const updateSchema = z
  .object(baseFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const SORTS = {
  '-appliedDate': { appliedDate: -1, _id: -1 },
  appliedDate: { appliedDate: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: -1 },
  company: { company: 1, _id: 1 },
  '-company': { company: -1, _id: -1 },
  lastActivityAt: { lastActivityAt: 1, _id: 1 },
};

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(STATUSES))),
  location: z.string().trim().max(120).optional(),
  position: z.string().trim().max(120).optional(),
  resume: objectId.optional(),
  followUp: z.enum(['true', 'false']).optional(),
  sort: z.enum(Object.keys(SORTS)).default('-appliedDate'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

async function assertOwnResume(userId, resumeId) {
  if (resumeId && !(await Resume.exists({ _id: resumeId, user: userId }))) throw badRequest('Resume not found');
}

async function findOwned(userId, id) {
  const app = await Application.findOne({ _id: id, user: userId });
  if (!app) throw notFound('Application not found');
  return app;
}

export function serializeApplication(app, followUpDays) {
  const obj = app.toObject ? app.toObject() : app;
  const idle = daysSince(obj.lastActivityAt);
  return {
    ...obj,
    id: obj._id.toString(),
    daysSinceActivity: idle,
    needsFollowUp: ACTIVE_STATUSES.includes(obj.status) && idle >= followUpDays,
  };
}

function buildFilter(userId, query, followUpDays) {
  const filter = query.followUp === 'true' ? followUpFilter(userId, followUpDays) : { user: userId };
  if (query.status.length) {
    filter.status = query.followUp === 'true'
      ? { $in: query.status.filter((s) => ACTIVE_STATUSES.includes(s)) }
      : { $in: query.status };
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ company: rx }, { position: rx }, { location: rx }, { notes: rx }];
  }
  if (query.location) filter.location = new RegExp(`^${escapeRegex(query.location)}$`, 'i');
  if (query.position) filter.position = new RegExp(`^${escapeRegex(query.position)}$`, 'i');
  if (query.resume) filter.resume = query.resume;
  return filter;
}

router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, sort } = req.query;
    const followUpDays = req.user.settings.followUpDays;
    const filter = buildFilter(req.user._id, req.query, followUpDays);
    const [items, total] = await Promise.all([
      Application.find(filter)
        .sort(SORTS[sort])
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('resume', 'label originalName')
        .lean(),
      Application.countDocuments(filter),
    ]);
    res.json({
      items: items.map((a) => serializeApplication(a, followUpDays)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

router.get(
  '/filters',
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const [companies, positions, locations] = await Promise.all([
      Application.distinct('company', { user: userId }),
      Application.distinct('position', { user: userId }),
      Application.distinct('location', { user: userId }),
    ]);
    const clean = (arr) => arr.filter(Boolean).sort((a, b) => a.localeCompare(b));
    res.json({ companies: clean(companies), positions: clean(positions), locations: clean(locations) });
  }),
);

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const apps = await Application.find({ user: req.user._id })
      .sort({ appliedDate: -1 })
      .populate('resume', 'label')
      .lean();
    const header = ['Company', 'Position', 'Status', 'Applied Date', 'Location', 'Salary', 'Job Link', 'Resume', 'Notes'];
    const rows = apps.map((a) => [
      a.company,
      a.position,
      a.status,
      a.appliedDate.toISOString().slice(0, 10),
      a.location,
      a.salary,
      a.jobLink,
      a.resume?.label ?? '',
      a.notes,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
    res.send(`\uFEFF${csv}`);
  }),
);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    await assertOwnResume(req.user._id, req.body.resume);
    const app = await Application.create({ ...req.body, user: req.user._id });
    await app.populate('resume', 'label originalName');
    res.status(201).json({ application: serializeApplication(app, req.user.settings.followUpDays) });
  }),
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const app = await findOwned(req.user._id, req.params.id);
    await app.populate('resume', 'label originalName');
    const interviews = await Interview.find({ application: app._id, user: req.user._id }).sort({ scheduledAt: 1 }).lean();
    res.json({ application: serializeApplication(app, req.user.settings.followUpDays), interviews });
  }),
);

router.patch(
  '/:id',
  validate({ params: idParams, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const app = await findOwned(req.user._id, req.params.id);
    if (req.body.resume !== undefined) await assertOwnResume(req.user._id, req.body.resume);
    app.set(req.body);
    if (app.isModified() && !app.isModified('status')) app.lastActivityAt = new Date();
    await app.save();
    await app.populate('resume', 'label originalName');
    res.json({ application: serializeApplication(app, req.user.settings.followUpDays) });
  }),
);

router.patch(
  '/:id/status',
  validate({ params: idParams, body: z.object({ status: z.enum(STATUSES) }).strict() }),
  asyncHandler(async (req, res) => {
    const app = await findOwned(req.user._id, req.params.id);
    app.status = req.body.status;
    await app.save();
    await app.populate('resume', 'label originalName');
    res.json({ application: serializeApplication(app, req.user.settings.followUpDays) });
  }),
);

router.post(
  '/:id/follow-up',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const app = await findOwned(req.user._id, req.params.id);
    const now = new Date();
    app.lastFollowUpAt = now;
    app.lastActivityAt = now;
    await app.save();
    await app.populate('resume', 'label originalName');
    res.json({ application: serializeApplication(app, req.user.settings.followUpDays) });
  }),
);

router.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const app = await findOwned(req.user._id, req.params.id);
    await Interview.deleteMany({ application: app._id, user: req.user._id });
    await app.deleteOne();
    res.status(204).end();
  }),
);

export default router;
