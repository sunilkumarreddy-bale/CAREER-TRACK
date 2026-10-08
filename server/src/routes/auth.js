import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Application, Interview, Resume, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { clearAuthCookie, setAuthCookie, signToken } from '../services/auth.js';
import { deleteFile } from '../services/fileStorage.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, unauthorized } from '../utils/httpError.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const registerSchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(80), email, password });
const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(128) });
const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    settings: z
      .object({
        followUpDays: z.coerce.number().int().min(1).max(60).optional(),
        emailReminders: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
const deleteSchema = z.object({ password: z.string().min(1, 'Password is required').max(128) });

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12);

function issueSession(res, user) {
  setAuthCookie(res, signToken(user));
}

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    if (await User.exists({ email: req.body.email })) throw conflict('An account with this email already exists');
    const user = await User.create(req.body);
    issueSession(res, user);
    res.status(201).json({ user });
  }),
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+password +tokenVersion');
    const valid = user
      ? await user.comparePassword(req.body.password)
      : await bcrypt.compare(req.body.password, DUMMY_HASH);
    if (!valid) throw unauthorized('Invalid email or password');
    issueSession(res, user);
    res.json({ user });
  }),
);

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.patch(
  '/me',
  requireAuth,
  validate({ body: updateMeSchema }),
  asyncHandler(async (req, res) => {
    const { name, settings } = req.body;
    if (name !== undefined) req.user.name = name;
    if (settings) {
      for (const [key, value] of Object.entries(settings)) {
        if (value !== undefined) req.user.settings[key] = value;
      }
    }
    await req.user.save();
    res.json({ user: req.user });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+password +tokenVersion');
    if (!(await user.comparePassword(req.body.currentPassword))) throw badRequest('Current password is incorrect');
    user.password = req.body.newPassword;
    user.tokenVersion += 1; // signs out every other session
    await user.save();
    issueSession(res, user);
    res.json({ user });
  }),
);

router.delete(
  '/me',
  requireAuth,
  authLimiter,
  validate({ body: deleteSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(req.body.password))) throw badRequest('Password is incorrect');
    const resumes = await Resume.find({ user: user._id }).select('fileId');
    await Promise.all(resumes.map((r) => deleteFile(r.fileId)));
    await Promise.all([
      Resume.deleteMany({ user: user._id }),
      Interview.deleteMany({ user: user._id }),
      Application.deleteMany({ user: user._id }),
    ]);
    await user.deleteOne();
    clearAuthCookie(res);
    res.status(204).end();
  }),
);

export default router;
