import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { INTERVIEW_MODES, INTERVIEW_OUTCOMES, INTERVIEW_ROUNDS } from '../utils/constants.js';
import { toDateTimeInput } from '../utils/format.js';
import Field from './Field.jsx';
import Modal from './Modal.jsx';

export default function InterviewForm({ interview, applicationId, defaultDate, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(interview);
  const [values, setValues] = useState(() => ({
    application: interview?.application?._id ?? interview?.application ?? applicationId ?? '',
    round: interview?.round ?? 'Technical',
    scheduledAt: toDateTimeInput(interview?.scheduledAt ?? defaultDate ?? ''),
    durationMinutes: interview?.durationMinutes ?? 60,
    mode: interview?.mode ?? 'Online',
    location: interview?.location ?? '',
    outcome: interview?.outcome ?? 'Pending',
    notes: interview?.notes ?? '',
  }));
  const [applications, setApplications] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (applicationId) return;
    api('/applications', { query: { limit: 500, sort: 'company' } })
      .then((d) => setApplications(d.items))
      .catch(() => setApplications([]));
  }, [applicationId]);

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (!values.application) found.application = 'Choose an application';
    if (!values.scheduledAt) found.scheduledAt = 'Date and time are required';
    const duration = Number(values.durationMinutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 600) found.durationMinutes = 'Between 5 and 600 minutes';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    const body = { ...values, durationMinutes: duration, scheduledAt: new Date(values.scheduledAt).toISOString() };
    try {
      const d = editing
        ? await api(`/interviews/${interview._id}`, { method: 'PATCH', body })
        : await api('/interviews', { method: 'POST', body });
      toast.success(editing ? 'Interview updated' : 'Interview scheduled');
      onSaved(d.interview);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.fieldErrors);
      toast.error(err);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit interview' : 'Schedule interview'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="interview-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="interview-form" className="form-grid" onSubmit={submit} noValidate>
        {!applicationId && (
          <Field label="Application *" error={errors.application} className="span-2">
            {(p) => (
              <select {...p} value={values.application} onChange={set('application')} disabled={applications === null}>
                <option value="">{applications === null ? 'Loading…' : applications.length ? '— Select —' : 'Add an application first'}</option>
                {applications?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company} — {a.position}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Round" error={errors.round}>
          {(p) => (
            <select {...p} value={values.round} onChange={set('round')}>
              {INTERVIEW_ROUNDS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Date & time *" error={errors.scheduledAt}>
          {(p) => <input {...p} type="datetime-local" value={values.scheduledAt} onChange={set('scheduledAt')} />}
        </Field>
        <Field label="Mode" error={errors.mode}>
          {(p) => (
            <select {...p} value={values.mode} onChange={set('mode')}>
              {INTERVIEW_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Duration (minutes)" error={errors.durationMinutes}>
          {(p) => <input {...p} type="number" min={5} max={600} step={5} value={values.durationMinutes} onChange={set('durationMinutes')} />}
        </Field>
        <Field label="Location / meeting link" error={errors.location} className="span-2">
          {(p) => <input {...p} value={values.location} onChange={set('location')} maxLength={2048} />}
        </Field>
        {editing && (
          <Field label="Outcome" error={errors.outcome}>
            {(p) => (
              <select {...p} value={values.outcome} onChange={set('outcome')}>
                {INTERVIEW_OUTCOMES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Notes / prep topics" error={errors.notes} className="span-2">
          {(p) => <textarea {...p} rows={4} value={values.notes} onChange={set('notes')} maxLength={5000} placeholder="DSA, system design, company-specific questions…" />}
        </Field>
      </form>
    </Modal>
  );
}
