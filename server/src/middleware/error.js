import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { error: 'Internal server error' };

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: err.message, ...(err.details && { details: err.details }) };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = {
      error: 'Validation failed',
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { error: `Invalid value for ${err.path}` };
  } else if (err?.code === 11000) {
    status = 409;
    body = { error: `${Object.keys(err.keyValue ?? {}).join(', ') || 'Value'} already exists` };
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    body = { error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { error: 'Malformed JSON body' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { error: 'Request body too large' };
  }

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    if (!env.isProd && err?.message) body.message = err.message;
  }
  res.status(status).json(body);
}
