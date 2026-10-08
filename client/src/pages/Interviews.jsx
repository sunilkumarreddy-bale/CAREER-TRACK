import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api/client.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import InterviewForm from '../components/InterviewForm.jsx';
import { PageLoader } from '../components/Spinner.jsx';
import { OutcomeBadge } from '../components/StatusBadge.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { INTERVIEW_OUTCOMES } from '../utils/constants.js';
import { formatDateTime, formatTime, relativeDays } from '../utils/format.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function buildMonth(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function Calendar({ interviews, onSelect, onCreate }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const days = useMemo(() => buildMonth(cursor), [cursor]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const i of interviews) {
      const k = dayKey(new Date(i.scheduledAt));
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return m;
  }, [interviews]);
  const today = dayKey(new Date());
  const shift = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div className="card calendar">
      <div className="calendar-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
          <Icon name="chevronLeft" />
        </button>
        <h2>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month">
          <Icon name="chevronRight" />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const d = new Date();
            setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
          }}
        >
          Today
        </button>
      </div>
      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday" role="columnheader">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const k = dayKey(d);
          const items = byDay.get(k) ?? [];
          return (
            <div
              key={k}
              role="gridcell"
              className={`calendar-day ${d.getMonth() !== cursor.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''}`}
              onDoubleClick={() => onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0))}
            >
              <span className="calendar-date">{d.getDate()}</span>
              {items.map((i) => (
                <button
                  type="button"
                  key={i._id}
                  className={`calendar-event outcome-${i.outcome.toLowerCase()}`}
                  onClick={() => onSelect(i)}
                  title={`${i.application?.company} – ${i.round} at ${formatTime(i.scheduledAt)}`}
                >
                  <span>{formatTime(i.scheduledAt)}</span> {i.application?.company}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted small">Tip: double-click a day to schedule an interview on it.</p>
    </div>
  );
}

export default function Interviews() {
  const toast = useToast();
  const { reloadReminders } = useOutletContext();
  const { data, error, loading, reload, setData } = useApi('/interviews');
  const [view, setView] = useState('list');
  const [form, setForm] = useState(null); // null | { interview?, defaultDate? }
  const [deleting, setDeleting] = useState(null);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const now = Date.now();
  const upcoming = data.items.filter((i) => new Date(i.scheduledAt).getTime() >= now);
  const past = data.items.filter((i) => new Date(i.scheduledAt).getTime() < now).reverse();

  const setOutcome = async (i, outcome) => {
    try {
      const d = await api(`/interviews/${i._id}`, { method: 'PATCH', body: { outcome } });
      setData((prev) => ({ ...prev, items: prev.items.map((x) => (x._id === i._id ? d.interview : x)) }));
      reloadReminders();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async () => {
    try {
      await api(`/interviews/${deleting._id}`, { method: 'DELETE' });
      toast.success('Interview deleted');
      reload();
      reloadReminders();
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };

  const renderRow = (i) => (
    <li key={i._id} className="list-item">
      <div className="date-pill" aria-hidden="true">
        <span>{new Date(i.scheduledAt).toLocaleDateString(undefined, { month: 'short' })}</span>
        <strong>{new Date(i.scheduledAt).getDate()}</strong>
      </div>
      <div className="grow">
        <Link to={`/applications/${i.application?._id}`}>
          <strong>{i.application?.company}</strong> — {i.application?.position}
        </Link>
        <small className="muted block">
          {i.round} · {i.mode} · {formatDateTime(i.scheduledAt)} ({relativeDays(i.scheduledAt)})
        </small>
        {i.location && <small className="block break">{i.location}</small>}
      </div>
      <select className="select-sm" value={i.outcome} onChange={(e) => setOutcome(i, e.target.value)} aria-label="Outcome">
        {INTERVIEW_OUTCOMES.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <button type="button" className="icon-btn" onClick={() => setForm({ interview: i })} aria-label="Edit interview">
        <Icon name="edit" />
      </button>
      <button type="button" className="icon-btn danger" onClick={() => setDeleting(i)} aria-label="Delete interview">
        <Icon name="trash" />
      </button>
    </li>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Interviews</h1>
          <p className="muted">
            {upcoming.length} upcoming · {past.length} past
          </p>
        </div>
        <div className="actions">
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
              List
            </button>
            <button type="button" role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>
              Calendar
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
            <Icon name="plus" /> Schedule interview
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <Calendar interviews={data.items} onSelect={(i) => setForm({ interview: i })} onCreate={(d) => setForm({ defaultDate: d })} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="calendar" title="No interviews yet" action={<button type="button" className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" /> Schedule interview</button>}>
          Keep every interview date in one place and get reminded before it happens.
        </EmptyState>
      ) : (
        <>
          <section className="card">
            <h2>Upcoming</h2>
            {upcoming.length ? <ul className="list">{upcoming.map((i) => renderRow(i))}</ul> : <p className="muted">Nothing scheduled.</p>}
          </section>
          {past.length > 0 && (
            <section className="card">
              <h2>Past</h2>
              <ul className="list">{past.map((i) => renderRow(i))}</ul>
            </section>
          )}
        </>
      )}

      {form && (
        <InterviewForm
          interview={form.interview}
          defaultDate={form.defaultDate}
          onClose={() => setForm(null)}
          onSaved={() => {
            reload();
            reloadReminders();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete interview?"
          message={`Delete the ${deleting.round} interview with ${deleting.application?.company}?`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
