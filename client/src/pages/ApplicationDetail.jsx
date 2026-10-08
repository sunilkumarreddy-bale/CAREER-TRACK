import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api, apiUrl } from '../api/client.js';
import ApplicationForm from '../components/ApplicationForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { ErrorState } from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import InterviewForm from '../components/InterviewForm.jsx';
import { PageLoader } from '../components/Spinner.jsx';
import StatusBadge, { OutcomeBadge } from '../components/StatusBadge.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { STATUSES } from '../utils/constants.js';
import { formatDateTime, formatDay, relativeDays } from '../utils/format.js';

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { reloadReminders } = useOutletContext();
  const { data, error, loading, reload, setData } = useApi(`/applications/${id}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [interviewForm, setInterviewForm] = useState(null); // null | 'new' | interview
  const [deletingInterview, setDeletingInterview] = useState(null);

  if (loading && !data) return <PageLoader />;
  if (error && !data) {
    return error.status === 404 || error.status === 400 ? (
      <ErrorState error={{ message: 'This application does not exist or was deleted.' }} />
    ) : (
      <ErrorState error={error} onRetry={reload} />
    );
  }

  const { application: app, interviews } = data;

  const changeStatus = async (status) => {
    try {
      const d = await api(`/applications/${app.id}/status`, { method: 'PATCH', body: { status } });
      setData((prev) => ({ ...prev, application: d.application }));
      toast.success(`Moved to ${status}`);
      reloadReminders();
    } catch (err) {
      toast.error(err);
    }
  };

  const followUp = async () => {
    try {
      const d = await api(`/applications/${app.id}/follow-up`, { method: 'POST' });
      setData((prev) => ({ ...prev, application: d.application }));
      toast.success('Marked as followed up');
      reloadReminders();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async () => {
    try {
      await api(`/applications/${app.id}`, { method: 'DELETE' });
      toast.success('Application deleted');
      reloadReminders();
      navigate('/applications', { replace: true });
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };

  const removeInterview = async () => {
    try {
      await api(`/interviews/${deletingInterview._id}`, { method: 'DELETE' });
      toast.success('Interview deleted');
      reload();
      reloadReminders();
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };

  return (
    <>
      <Link to="/applications" className="back-link">
        <Icon name="arrowLeft" size={16} /> Applications
      </Link>
      <div className="page-head">
        <div>
          <h1>{app.company}</h1>
          <p className="muted">{app.position}</p>
        </div>
        <div className="actions">
          <label className="inline-select">
            <select value={app.status} onChange={(e) => changeStatus(e.target.value)} aria-label="Status">
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            <Icon name="edit" /> Edit
          </button>
          <button type="button" className="btn btn-danger-outline" onClick={() => setDeleting(true)}>
            <Icon name="trash" /> Delete
          </button>
        </div>
      </div>

      {app.needsFollowUp && (
        <div className="alert alert-warn">
          <Icon name="bell" />
          <span className="grow">
            No activity for <strong>{app.daysSinceActivity} days</strong>. Consider following up with {app.company}.
          </span>
          <button type="button" className="btn btn-sm" onClick={followUp}>
            <Icon name="check" size={14} /> Mark followed up
          </button>
        </div>
      )}

      <div className="grid-2 detail-grid">
        <section className="card">
          <h2>Details</h2>
          <dl className="details">
            <dt>Status</dt>
            <dd>
              <StatusBadge status={app.status} />
            </dd>
            <dt>Applied on</dt>
            <dd>{formatDay(app.appliedDate)}</dd>
            <dt>Location</dt>
            <dd>{app.location || '—'}</dd>
            <dt>Salary</dt>
            <dd>{app.salary || '—'}</dd>
            <dt>Job link</dt>
            <dd>
              {app.jobLink ? (
                <a href={app.jobLink} target="_blank" rel="noopener noreferrer" className="link break">
                  {app.jobLink}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt>Resume</dt>
            <dd>
              {app.resume ? (
                <a href={apiUrl(`/resumes/${app.resume._id}/download`)} className="link">
                  <Icon name="file" size={14} /> {app.resume.label}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt>Last activity</dt>
            <dd>{relativeDays(app.lastActivityAt)}</dd>
            {app.lastFollowUpAt && (
              <>
                <dt>Last follow-up</dt>
                <dd>{formatDateTime(app.lastFollowUpAt)}</dd>
              </>
            )}
          </dl>
          {app.notes && (
            <>
              <h3>Notes</h3>
              <p className="notes">{app.notes}</p>
            </>
          )}
        </section>

        <section className="card">
          <h2>Status history</h2>
          <ol className="timeline">
            {[...app.statusHistory].reverse().map((h, i) => (
              <li key={`${h.status}-${h.changedAt}-${i}`}>
                <StatusBadge status={h.status} />
                <small className="muted">{formatDateTime(h.changedAt)}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Interviews</h2>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setInterviewForm('new')}>
            <Icon name="plus" size={14} /> Schedule
          </button>
        </div>
        {interviews.length === 0 ? (
          <p className="muted">No interviews yet.</p>
        ) : (
          <ul className="list">
            {interviews.map((i) => (
              <li key={i._id} className="list-item">
                <Icon name="calendar" className="list-icon" />
                <div className="grow">
                  <strong>{i.round}</strong> · {i.mode}
                  <small className="muted block">
                    {formatDateTime(i.scheduledAt)} {i.location && `· ${i.location}`}
                  </small>
                  {i.notes && <small className="block notes">{i.notes}</small>}
                </div>
                <OutcomeBadge outcome={i.outcome} />
                <button type="button" className="icon-btn" onClick={() => setInterviewForm(i)} aria-label="Edit interview">
                  <Icon name="edit" />
                </button>
                <button type="button" className="icon-btn danger" onClick={() => setDeletingInterview(i)} aria-label="Delete interview">
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && <ApplicationForm application={app} onClose={() => setEditing(false)} onSaved={() => { reload(); reloadReminders(); }} />}
      {deleting && (
        <ConfirmDialog
          title="Delete application?"
          message={`This permanently deletes ${app.company} — ${app.position} and its interviews.`}
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
      {interviewForm && (
        <InterviewForm
          interview={interviewForm === 'new' ? null : interviewForm}
          applicationId={app.id}
          onClose={() => setInterviewForm(null)}
          onSaved={() => { reload(); reloadReminders(); }}
        />
      )}
      {deletingInterview && (
        <ConfirmDialog
          title="Delete interview?"
          message={`Delete the ${deletingInterview.round} interview on ${formatDateTime(deletingInterview.scheduledAt)}?`}
          onConfirm={removeInterview}
          onClose={() => setDeletingInterview(null)}
        />
      )}
    </>
  );
}
