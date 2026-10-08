export const STATUSES = ['Applied', 'Screening', 'Interview', 'Final Round', 'Offer', 'Rejected'];
export const ACTIVE_STATUSES = ['Applied', 'Screening', 'Interview', 'Final Round'];
export const INTERVIEW_ROUNDS = ['Online Test', 'Screening', 'Technical', 'HR', 'Managerial', 'Final', 'Other'];
export const INTERVIEW_MODES = ['Online', 'On-site', 'Phone'];
export const INTERVIEW_OUTCOMES = ['Pending', 'Passed', 'Failed', 'Cancelled'];

export const STATUS_COLORS = {
  Applied: 'var(--c-applied)',
  Screening: 'var(--c-screening)',
  Interview: 'var(--c-interview)',
  'Final Round': 'var(--c-final)',
  Offer: 'var(--c-offer)',
  Rejected: 'var(--c-rejected)',
};

export const statusSlug = (s) => s.toLowerCase().replace(/\s+/g, '-');
