import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const COOKIE_NAME = 'ct_token';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion ?? 0 }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET);

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
  };
}

export function setAuthCookie(res, token) {
  const decoded = jwt.decode(token);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), expires: new Date(decoded.exp * 1000) });
}

export const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, cookieOptions());
