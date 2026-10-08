import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api/client.js';
import ApplicationForm from '../components/ApplicationForm.jsx';
import { ErrorState } from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { PageLoader } from '../components/Spinner.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { STATUSES, statusSlug } from '../utils/constants.js';
import { formatDateTime, relativeDays } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

export function Pipeline({ byStatus, total }) {
  return (
    <div className="pipeline">
      <div className="pipeline-bar" role="img" aria-label="Applications by status">
        {STATUSES.map((s) =>
          byStatus[s] ? (
            <span key={s} className={`seg seg-${statusSlug(s)}`} style={{ flexGrow: byStatus[s] }} title={`${s}: ${byStatus[s]}`} />
          ) : null,
        )}
        {!total && <span className="seg seg-empty" style={{ flexGrow: 1 }} />}
      </div>
      <ul className="pipeline-legend">
        {STATUSES.map((s) => (
          <li key={s}>
            <Link to={`/applications?status=${encodeURIComponent(s)}`}>
              <i className={`dot seg-${statusSlug(s)}`} />
              {s} <strong>{byStatus[s]}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { reloadReminders } = useOutletContext();
  const { data, error, loading, reload } = useApi('/dashboard');
  const [adding, setAdding] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const { summary, upcomingInterviews, followUps, recent } = data;

  const markFollowedUp = async (id) => {
    try {
      await api(`/applications/${id}/follow-up`, { method: 'POST' });
      toast.success('Marked as followed up');
      reload();
      reloadReminders();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi, {user.name.split(' ')[0]} 👋</h1>
          <p className="muted">Here's where your job search stands.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add application
        </button>
      </div>

      <section className="stats">
        <StatCard label="Applications" value={summary.total} hint={`${summary.active} active`} />
        <StatCard label="Reached interview" value={summary.interviews} hint={`${summary.rates.interview}% of applications`} tone="info" />
        <StatCard label="Offers" value={summary.offers} hint={`${summary.rates.offer}% offer rate`} tone="success" />
        <StatCard label="Rejections" value={summary.rejections} hint={`${summary.rates.rejection}% of applications`} tone="danger" />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Application pipeline</h2>
          <Link to="/board" className="link">
            Open board →
          </Link>
        </div>
        <Pipeline byStatus={summary.byStatus} total={summary.total} />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Upcoming interviews</h2>
            <Link to="/interviews" className="link">
              Calendar →
            </Link>
          </div>
          {upcomingInterviews.length === 0 ? (
            <p className="muted">No interviews scheduled.</p>
          ) : (
            <ul className="list">
              {upcomingInterviews.map((i) => (
                <li key={i._id} className="list-item">
                  <Icon name="calendar" className="list-icon" />
                  <div className="grow">
                    <Link to={`/applications/${i.application?._id}`}>
                      <strong>{i.application?.company}</strong> — {i.round}
                    </Link>
                    <small className="muted block">
                      {formatDateTime(i.scheduledAt)} · {relativeDays(i.scheduledAt)}
                    </small>
                  </div>
                  <span className="chip">{i.mode}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" id="reminders">
          <div className="card-head">
            <h2>Follow-ups due</h2>
            <Link to="/applications?followUp=true" className="link">
              View all →
            </Link>
          </div>
          {followUps.length === 0 ? (
            <p className="muted">Nothing to follow up on. Nice!</p>
          ) : (
            <ul className="list">
              {followUps.map((a) => (
                <li key={a.id} className="list-item">
                  <Icon name="bell" className="list-icon warn" />
                  <div className="grow">
                    <Link to={`/applications/${a.id}`}>
                      <strong>{a.company}</strong> — {a.position}
                    </Link>
                    <small className="muted block">No response for {a.daysSinceActivity} days</small>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => markFollowedUp(a.id)}>
                    <Icon name="check" size={14} /> Done
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Recent activity</h2>
          <Link to="/applications" className="link">
            All applications →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">Add your first application to get started.</p>
        ) : (
          <ul className="list">
            {recent.map((a) => (
              <li key={a._id} className="list-item">
                <div className="grow">
                  <Link to={`/applications/${a._id}`}>
                    <strong>{a.company}</strong> — {a.position}
                  </Link>
                  <small className="muted block">Updated {relativeDays(a.updatedAt)}</small>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && <ApplicationForm onClose={() => setAdding(false)} onSaved={() => { reload(); reloadReminders(); }} />}
    </>
  );
}
