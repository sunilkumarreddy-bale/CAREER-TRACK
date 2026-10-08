import { HttpError } from '../utils/httpError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Auth uses an httpOnly cookie, so state-changing requests must carry a custom
// header. Browsers only allow cross-origin custom headers after a CORS
// preflight, which our CORS policy rejects for unknown origins.
export function requireCsrfHeader(req, _res, next) {
  if (SAFE_METHODS.has(req.method) || req.get('X-Requested-With') === 'XMLHttpRequest') return next();
  next(new HttpError(403, 'Missing X-Requested-With header'));
}
