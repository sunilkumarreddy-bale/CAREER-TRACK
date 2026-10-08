import { ACTIVE_STATUSES, DAY_MS } from './constants.js';

export function daysSince(date, now = Date.now()) {
  return Math.floor((now - new Date(date).getTime()) / DAY_MS);
}

/** Mongo filter for active applications with no activity for at least `days` days. */
export function followUpFilter(userId, days, now = Date.now()) {
  return {
    user: userId,
    status: { $in: ACTIVE_STATUSES },
    lastActivityAt: { $lte: new Date(now - days * DAY_MS) },
  };
}
