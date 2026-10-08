import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Application, Resume } from '../models/index.js';
import { idParams, validate } from '../middleware/validate.js';
import { deleteFile, openDownloadStream, saveFile } from '../services/fileStorage.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { RESUME_MIME_TYPES } from '../utils/constants.js';
import { badRequest, notFound } from '../utils/httpError.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_RESUME_MB * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (RESUME_MIME_TYPES[file.mimetype] && RESUME_MIME_TYPES[file.mimetype] === ext) return cb(null, true);
    cb(badRequest('Only PDF, DOC or DOCX files are allowed'));
  },
});

// Check magic bytes so a renamed binary can't masquerade as a document.
function looksLikeDocument(buffer, mime) {
  const head = buffer.subarray(0, 8);
  if (mime === 'application/pdf') return head.subarray(0, 5).toString('latin1') === '%PDF-';
  if (mime.endsWith('wordprocessingml.document')) return head[0] === 0x50 && head[1] === 0x4b; // ZIP
  if (mime === 'application/msword') return head.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  return false;
}

const labelSchema = z.string().trim().min(1, 'Label is required').max(80);
const sanitizeName = (name) => path.basename(name).replace(/[^\w.\- ()]/g, '_').slice(0, 200) || 'resume';

async function withUsage(userId, resumes) {
  const counts = await Application.aggregate([
    { $match: { user: userId, resume: { $ne: null } } },
    { $group: { _id: '$resume', count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [c._id.toString(), c.count]));
  return resumes.map((r) => ({ ...r, applicationsCount: byId.get(r._id.toString()) ?? 0 }));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const resumes = await Resume.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ items: await withUsage(req.user._id, resumes) });
  }),
);

router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('A resume file is required');
    const label = labelSchema.parse(req.body.label ?? path.parse(req.file.originalname).name);
    if (!looksLikeDocument(req.file.buffer, req.file.mimetype)) throw badRequest('File content does not match its type');
    const originalName = sanitizeName(req.file.originalname);
    const fileId = await saveFile(req.file.buffer, originalName, { user: req.user._id, mimeType: req.file.mimetype });
    try {
      const resume = await Resume.create({
        user: req.user._id,
        label,
        originalName,
        mimeType: req.file.mimetype,
        size: req.file.size,
        fileId,
      });
      res.status(201).json({ resume: { ...resume.toObject(), applicationsCount: 0 } });
    } catch (err) {
      await deleteFile(fileId);
      throw err;
    }
  }),
);

router.get(
  '/:id/download',
  validate({ params: idParams }),
  asyncHandler(async (req, res, next) => {
    const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id });
    if (!resume) throw notFound('Resume not found');
    res.setHeader('Content-Type', resume.mimeType);
    res.setHeader('Content-Length', resume.size);
    const disposition = req.query.inline === 'true' && resume.mimeType === 'application/pdf' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${resume.originalName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    openDownloadStream(resume.fileId)
      .on('error', (err) => (res.headersSent ? res.destroy(err) : next(notFound('Resume file missing'))))
      .pipe(res);
  }),
);

router.patch(
  '/:id',
  validate({ params: idParams, body: z.object({ label: labelSchema }).strict() }),
  asyncHandler(async (req, res) => {
    const resume = await Resume.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { label: req.body.label } },
      { new: true },
    ).lean();
    if (!resume) throw notFound('Resume not found');
    const [withCount] = await withUsage(req.user._id, [resume]);
    res.json({ resume: withCount });
  }),
);

router.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id });
    if (!resume) throw notFound('Resume not found');
    await Application.updateMany({ user: req.user._id, resume: resume._id }, { $set: { resume: null } });
    await deleteFile(resume.fileId);
    await resume.deleteOne();
    res.status(204).end();
  }),
);

export default router;
