import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api/client.js';
import ApplicationForm from '../components/ApplicationForm.jsx';
import { ErrorState } from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { PageLoader } from '../components/Spinner.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { STATUSES, statusSlug } from '../utils/constants.js';
import { formatDay } from '../utils/format.js';

const QUERY = { limit: 500, sort: '-updatedAt' };

export default function Board() {
  const toast = useToast();
  const { reloadReminders } = useOutletContext();
  const { data, error, loading, reload, setData } = useApi('/applications', QUERY);
  const [dragOver, setDragOver] = useState(null);
  const [adding, setAdding] = useState(null);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const columns = Object.fromEntries(STATUSES.map((s) => [s, []]));
  for (const a of data.items) columns[a.status]?.push(a);

  const move = async (id, status) => {
    const current = data.items.find((a) => a.id === id);
    if (!current || current.status === status) return;
    const previous = current.status;
    setData((d) => ({ ...d, items: d.items.map((a) => (a.id === id ? { ...a, status } : a)) }));
    try {
      const res = await api(`/applications/${id}/status`, { method: 'PATCH', body: { status } });
      setData((d) => ({ ...d, items: d.items.map((a) => (a.id === id ? res.application : a)) }));
      reloadReminders();
    } catch (err) {
      setData((d) => ({ ...d, items: d.items.map((a) => (a.id === id ? { ...a, status: previous } : a)) }));
      toast.error(err);
    }
  };

  const onDrop = (status) => (e) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id) move(id, status);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <p className="muted">Drag cards between stages, or use the stage menu on each card.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding('Applied')}>
          <Icon name="plus" /> Add application
        </button>
      </div>
      {data.total > data.items.length && (
        <div className="alert alert-info">Showing the {data.items.length} most recently updated applications.</div>
      )}
      <div className="board">
        {STATUSES.map((status) => (
          <section
            key={status}
            className={`column col-${statusSlug(status)} ${dragOver === status ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOver !== status) setDragOver(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
            }}
            onDrop={onDrop(status)}
            aria-label={`${status} column`}
          >
            <header className="column-head">
              <h2>{status}</h2>
              <span className="count">{columns[status].length}</span>
            </header>
            <div className="column-body">
              {columns[status].map((a) => (
                <article
                  key={a.id}
                  className="kcard"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', a.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <Link to={`/applications/${a.id}`} className="kcard-title">
                    {a.company}
                  </Link>
                  <span className="kcard-sub">{a.position}</span>
                  <span className="kcard-meta">
                    {formatDay(a.appliedDate)}
                    {a.needsFollowUp && <span className="chip chip-warn">Follow up</span>}
                  </span>
                  <select
                    className="kcard-move"
                    value={a.status}
                    onChange={(e) => move(a.id, e.target.value)}
                    aria-label={`Move ${a.company} to stage`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </article>
              ))}
              <button type="button" className="add-card" onClick={() => setAdding(status)}>
                <Icon name="plus" size={14} /> Add card
              </button>
            </div>
          </section>
        ))}
      </div>
      {adding && (
        <ApplicationForm
          defaults={{ status: adding }}
          onClose={() => setAdding(null)}
          onSaved={(app) => setData((d) => ({ ...d, total: d.total + 1, items: [app, ...d.items] }))}
        />
      )}
    </>
  );
}
