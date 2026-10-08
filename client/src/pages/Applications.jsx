import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, apiUrl } from '../api/client.js';
import ApplicationForm from '../components/ApplicationForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import Spinner from '../components/Spinner.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi, useDebounced } from '../hooks/useApi.js';
import { STATUSES } from '../utils/constants.js';
import { formatDay } from '../utils/format.js';

const SORT_OPTIONS = [
  ['-appliedDate', 'Newest first'],
  ['appliedDate', 'Oldest first'],
  ['-updatedAt', 'Recently updated'],
  ['company', 'Company A–Z'],
  ['-company', 'Company Z–A'],
];
const PAGE_SIZE = 20;

export default function Applications() {
  const toast = useToast();
  const navigate = useNavigate();
  const { reloadReminders } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);
  const [editing, setEditing] = useState(null); // null | 'new' | application
  const [deleting, setDeleting] = useState(null);

  const filters = {
    q,
    status: params.get('status') ?? '',
    position: params.get('position') ?? '',
    location: params.get('location') ?? '',
    resume: params.get('resume') ?? '',
    followUp: params.get('followUp') === 'true' ? 'true' : '',
    sort: params.get('sort') ?? '-appliedDate',
    page: Number(params.get('page')) || 1,
    limit: PAGE_SIZE,
  };
  const { data, error, loading, reload } = useApi('/applications', filters);
  const options = useApi('/applications/filters');

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const onSearch = (value) => {
    setSearch(value);
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    next.delete('page');
    setParams(next, { replace: true });
  };

  const hasFilters = Boolean(filters.q || filters.status || filters.position || filters.location || filters.followUp || filters.resume);

  const remove = async () => {
    try {
      await api(`/applications/${deleting.id}`, { method: 'DELETE' });
      toast.success('Application deleted');
      reload();
      options.reload();
      reloadReminders();
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Applications</h1>
          <p className="muted">{data ? `${data.total} application${data.total === 1 ? '' : 's'}` : ' '}</p>
        </div>
        <div className="actions">
          <a className="btn" href={apiUrl('/applications/export')} download>
            <Icon name="download" /> Export CSV
          </a>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Add application
          </button>
        </div>
      </div>

      <div className="toolbar card">
        <label className="search">
          <Icon name="search" />
          <input type="search" placeholder="Search company, position, location, notes…" value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Search applications" />
        </label>
        <select value={filters.status} onChange={(e) => update({ status: e.target.value })} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={filters.position} onChange={(e) => update({ position: e.target.value })} aria-label="Filter by position">
          <option value="">All positions</option>
          {options.data?.positions.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={filters.location} onChange={(e) => update({ location: e.target.value })} aria-label="Filter by location">
          <option value="">All locations</option>
          {options.data?.locations.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
          {SORT_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={filters.followUp === 'true'} onChange={(e) => update({ followUp: e.target.checked ? 'true' : '' })} />
          Needs follow-up
        </label>
        {hasFilters && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setParams({}, { replace: true });
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <div className="center-pad">
          <Spinner size={28} />
        </div>
      ) : data.items.length === 0 ? (
        hasFilters ? (
          <EmptyState icon="search" title="No matching applications">
            Try a different search or clear the filters.
          </EmptyState>
        ) : (
          <EmptyState
            title="No applications yet"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
                <Icon name="plus" /> Add your first application
              </button>
            }
          >
            Every application you track shows up here, on the pipeline board and in your analytics.
          </EmptyState>
        )
      ) : (
        <div className={`card table-card ${loading ? 'is-loading' : ''}`}>
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Position</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Location</th>
                <th>Resume</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id} onClick={() => navigate(`/applications/${a.id}`)} className="clickable">
                  <td data-label="Company">
                    <Link to={`/applications/${a.id}`} onClick={(e) => e.stopPropagation()}>
                      <strong>{a.company}</strong>
                    </Link>
                    {a.needsFollowUp && (
                      <span className="chip chip-warn" title={`No activity for ${a.daysSinceActivity} days`}>
                        Follow up
                      </span>
                    )}
                  </td>
                  <td data-label="Position">{a.position}</td>
                  <td data-label="Status">
                    <StatusBadge status={a.status} />
                  </td>
                  <td data-label="Applied">{formatDay(a.appliedDate)}</td>
                  <td data-label="Location">{a.location || '—'}</td>
                  <td data-label="Resume">{a.resume?.label ?? '—'}</td>
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="icon-btn" onClick={() => setEditing(a)} aria-label={`Edit ${a.company}`}>
                      <Icon name="edit" />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => setDeleting(a)} aria-label={`Delete ${a.company}`}>
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pages > 1 && (
            <nav className="pager" aria-label="Pagination">
              <button type="button" className="btn btn-sm" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}>
                <Icon name="chevronLeft" size={14} /> Prev
              </button>
              <span>
                Page {data.page} of {data.pages}
              </span>
              <button type="button" className="btn btn-sm" disabled={data.page >= data.pages} onClick={() => update({ page: data.page + 1 })}>
                Next <Icon name="chevronRight" size={14} />
              </button>
            </nav>
          )}
        </div>
      )}

      {editing && (
        <ApplicationForm
          application={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            reload();
            options.reload();
            reloadReminders();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete application?"
          message={`This permanently deletes ${deleting.company} — ${deleting.position} and its interviews.`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
