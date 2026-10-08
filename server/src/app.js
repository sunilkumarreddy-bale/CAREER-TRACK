import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { requireCsrfHeader } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import applicationRoutes from './routes/applications.js';
import authRoutes from './routes/auth.js';
import insightRoutes from './routes/insights.js';
import interviewRoutes from './routes/interviews.js';
import resumeRoutes from './routes/resumes.js';

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          // TLS is terminated by the host/proxy; forcing upgrades breaks plain-HTTP self-hosting.
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  if (env.clientOrigins.length) {
    app.use('/api', cors({ origin: env.clientOrigins, credentials: true }));
  }

  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'connected' : 'disconnected', uptime: process.uptime() });
  });

  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: env.isTest ? 10000 : 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests, please slow down' },
    }),
  );
  app.use('/api', express.json({ limit: '100kb' }), cookieParser(), requireCsrfHeader);

  app.use('/api/auth', authRoutes);
  app.use('/api/applications', requireAuth, applicationRoutes);
  app.use('/api/interviews', requireAuth, interviewRoutes);
  app.use('/api/resumes', requireAuth, resumeRoutes);
  app.use('/api', requireAuth, insightRoutes);
  app.use('/api', notFoundHandler);

  // Serve the built React app (single-container deployment).
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
