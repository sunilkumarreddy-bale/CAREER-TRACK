import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { STATUSES } from '../utils/constants.js';
import { toDateInput, todayInput } from '../utils/format.js';
import Field from './Field.jsx';
import Modal from './Modal.jsx';

const EMPTY = { company: '', position: '', status: 'Applied', appliedDate: '', location: '', salary: '', jobLink: '', resume: '', notes: '' };

function validate(v) {
  const e = {};
  if (!v.company.trim()) e.company = 'Company is required';
  if (!v.position.trim()) e.position = 'Position is required';
  if (v.jobLink && !/^https?:\/\/\S+$/i.test(v.jobLink.trim())) e.jobLink = 'Enter a full URL starting with http:// or https://';
  if (!v.appliedDate) e.appliedDate = 'Date is required';
  return e;
}

export default function ApplicationForm({ application, defaults, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(application);
  const [values, setValues] = useState(() =>
    editing
      ? {
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, application[k] ?? ''])),
          appliedDate: toDateInput(application.appliedDate),
          resume: application.resume?._id ?? application.resume ?? '',
        }
      : { ...EMPTY, appliedDate: todayInput(), ...defaults },
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [resumes, setResumes] = useState([]);

  useEffect(() => {
    api('/resumes')
      .then((d) => setResumes(d.items))
      .catch(() => setResumes([]));
  }, []);

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    const body = {
      ...values,
      company: values.company.trim(),
      position: values.position.trim(),
      jobLink: values.jobLink.trim(),
      resume: values.resume || null,
    };
    try {
      const d = editing
        ? await api(`/applications/${application.id ?? application._id}`, { method: 'PATCH', body })
        : await api('/applications', { method: 'POST', body });
      toast.success(editing ? 'Application updated' : 'Application added');
      onSaved(d.application);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.fieldErrors);
      toast.error(err);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit application' : 'Add application'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="application-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="application-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Company *" error={errors.company}>
          {(p) => <input {...p} value={values.company} onChange={set('company')} maxLength={120} autoComplete="organization" />}
        </Field>
        <Field label="Position *" error={errors.position}>
          {(p) => <input {...p} value={values.position} onChange={set('position')} maxLength={120} />}
        </Field>
        <Field label="Status" error={errors.status}>
          {(p) => (
            <select {...p} value={values.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Applied on *" error={errors.appliedDate}>
          {(p) => <input {...p} type="date" value={values.appliedDate} onChange={set('appliedDate')} />}
        </Field>
        <Field label="Location" error={errors.location}>
          {(p) => <input {...p} value={values.location} onChange={set('location')} maxLength={120} placeholder="e.g. Bangalore / Remote" />}
        </Field>
        <Field label="Salary" error={errors.salary}>
          {(p) => <input {...p} value={values.salary} onChange={set('salary')} maxLength={60} placeholder="e.g. ₹8 LPA" />}
        </Field>
        <Field label="Job link" error={errors.jobLink} className="span-2">
          {(p) => <input {...p} type="url" value={values.jobLink} onChange={set('jobLink')} placeholder="https://…" />}
        </Field>
        <Field label="Resume used" error={errors.resume} className="span-2" hint={resumes.length ? undefined : 'Upload resumes on the Resumes page to link them here.'}>
          {(p) => (
            <select {...p} value={values.resume} onChange={set('resume')}>
              <option value="">— None —</option>
              {resumes.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.label} ({r.originalName})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Notes" error={errors.notes} className="span-2">
          {(p) => <textarea {...p} rows={4} value={values.notes} onChange={set('notes')} maxLength={5000} />}
        </Field>
      </form>
    </Modal>
  );
}
