import { Application, Interview } from '../models/index.js';
import { INTERVIEW_STAGE_STATUSES, STATUSES } from '../utils/constants.js';

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

function monthKeys(count, now = new Date()) {
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * All rates use the same denominator (total applications) so the numbers on the
 * dashboard, analytics page and pipeline always agree with each other.
 */
export async function computeSummary(userId) {
  const [row] = await Application.aggregate([
    { $match: { user: userId } },
    {
      $project: {
        status: 1,
        reachedInterview: { $gt: [{ $size: { $setIntersection: ['$statusHistory.status', INTERVIEW_STAGE_STATUSES] } }, 0] },
        responded: {
          $gt: [{ $size: { $setDifference: ['$statusHistory.status', ['Applied']] } }, 0],
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        reachedInterview: { $sum: { $cond: ['$reachedInterview', 1, 0] } },
        responded: { $sum: { $cond: ['$responded', 1, 0] } },
        statuses: { $push: '$status' },
      },
    },
  ]);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const s of row?.statuses ?? []) byStatus[s] += 1;
  const total = row?.total ?? 0;
  const offers = byStatus.Offer;
  const rejections = byStatus.Rejected;

  return {
    total,
    active: total - offers - rejections,
    interviews: row?.reachedInterview ?? 0,
    offers,
    rejections,
    byStatus,
    rates: {
      response: pct(row?.responded ?? 0, total),
      interview: pct(row?.reachedInterview ?? 0, total),
      offer: pct(offers, total),
      rejection: pct(rejections, total),
    },
  };
}

export async function computeAnalytics(userId, months = 6) {
  const keys = monthKeys(months);
  const since = new Date(`${keys[0]}-01T00:00:00.000Z`);

  const [summary, monthly, interviewsByRound, interviewOutcomes, resumePerformance] = await Promise.all([
    computeSummary(userId),
    Application.aggregate([
      { $match: { user: userId, appliedDate: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$appliedDate' } },
          applications: { $sum: 1 },
          interviews: {
            $sum: {
              $cond: [{ $gt: [{ $size: { $setIntersection: ['$statusHistory.status', INTERVIEW_STAGE_STATUSES] } }, 0] }, 1, 0],
            },
          },
          offers: { $sum: { $cond: [{ $eq: ['$status', 'Offer'] }, 1, 0] } },
        },
      },
    ]),
    Interview.aggregate([{ $match: { user: userId } }, { $group: { _id: '$round', count: { $sum: 1 } } }]),
    Interview.aggregate([{ $match: { user: userId } }, { $group: { _id: '$outcome', count: { $sum: 1 } } }]),
    Application.aggregate([
      { $match: { user: userId, resume: { $ne: null } } },
      {
        $group: {
          _id: '$resume',
          applications: { $sum: 1 },
          interviews: {
            $sum: {
              $cond: [{ $gt: [{ $size: { $setIntersection: ['$statusHistory.status', INTERVIEW_STAGE_STATUSES] } }, 0] }, 1, 0],
            },
          },
          offers: { $sum: { $cond: [{ $eq: ['$status', 'Offer'] }, 1, 0] } },
        },
      },
      { $lookup: { from: 'resumes', localField: '_id', foreignField: '_id', as: 'resume' } },
      { $unwind: '$resume' },
      { $project: { _id: 0, id: '$_id', label: '$resume.label', applications: 1, interviews: 1, offers: 1 } },
      { $sort: { applications: -1 } },
    ]),
  ]);

  const monthMap = new Map(monthly.map((m) => [m._id, m]));
  return {
    summary,
    monthly: keys.map((key) => {
      const m = monthMap.get(key) ?? { applications: 0, interviews: 0, offers: 0 };
      return {
        month: key,
        applications: m.applications,
        interviews: m.interviews,
        offers: m.offers,
        interviewRate: pct(m.interviews, m.applications),
      };
    }),
    interviewsByRound: interviewsByRound.map((r) => ({ round: r._id, count: r.count })).sort((a, b) => b.count - a.count),
    interviewOutcomes: Object.fromEntries(interviewOutcomes.map((o) => [o._id, o.count])),
    resumePerformance: resumePerformance.map((r) => ({ ...r, interviewRate: pct(r.interviews, r.applications) })),
  };
}
