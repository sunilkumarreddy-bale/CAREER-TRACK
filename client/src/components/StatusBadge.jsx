import { statusSlug } from '../utils/constants.js';

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${statusSlug(status)}`}>{status}</span>;
}

export function OutcomeBadge({ outcome }) {
  return <span className={`badge outcome-${outcome.toLowerCase()}`}>{outcome}</span>;
}
