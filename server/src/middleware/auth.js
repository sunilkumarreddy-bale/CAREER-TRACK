import { User } from '../models/User.js';
import { COOKIE_NAME, verifyToken } from '../services/auth.js';
import { unauthorized } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw unauthorized('Session expired, please log in again');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || user.tokenVersion !== payload.tv) throw unauthorized('Session expired, please log in again');

  req.user = user;
  next();
});
