import { z } from 'zod';

const bool = (fallback) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CLIENT_ORIGIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  MAX_RESUME_MB: z.coerce.number().positive().max(50).default(5),
  ENABLE_SCHEDULER: z.enum(['true', 'false']).optional(),
  INTERVIEW_REMINDER_CRON: z.string().default('*/15 * * * *'),
  FOLLOWUP_DIGEST_CRON: z.string().default('0 8 * * *'),
  SCHEDULER_TIMEZONE: z.string().default('UTC'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('CareerTrack <no-reply@careertrack.local>'),
  APP_URL: z.string().optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';
  return {
    ...e,
    isProd,
    isTest: e.NODE_ENV === 'test',
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : isProd || e.COOKIE_SAMESITE === 'none',
    schedulerEnabled: e.ENABLE_SCHEDULER ? e.ENABLE_SCHEDULER === 'true' : e.NODE_ENV !== 'test',
    clientOrigins: e.CLIENT_ORIGIN ? e.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) : [],
    smtpEnabled: Boolean(e.SMTP_HOST),
  };
}

export const env = load();
