import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiUrl } from '../api/client.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { PageLoader } from '../components/Spinner.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatBytes, formatDay } from '../utils/format.js';

const MAX_MB = 5;
const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function UploadForm({ onUploaded }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (f) => {
    setError('');
    if (!f) return setFile(null);
    if (!/\.(pdf|docx?)$/i.test(f.name)) {
      setError('Only PDF, DOC or DOCX files are allowed');
      return setFile(null);
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File must be smaller than ${MAX_MB} MB`);
      return setFile(null);
    }
    setFile(f);
    if (!label) setLabel(f.name.replace(/\.[^.]+$/, '').slice(0, 80));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Choose a file to upload');
    const form = new FormData();
    form.append('label', label.trim() || file.name);
    form.append('file', file);
    setBusy(true);
    try {
      const d = await api('/resumes', { method: 'POST', body: form });
      toast.success('Resume uploaded');
      onUploaded(d.resume);
      setFile(null);
      setLabel('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card upload" onSubmit={submit} noValidate>
      <h2>Upload a resume version</h2>
      <div className="upload-row">
        <Field label="File (PDF, DOC, DOCX · max 5 MB)" error={error}>
          {(p) => <input {...p} ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0])} />}
        </Field>
        <Field label="Label">
          {(p) => <input {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. SDE v3" />}
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Icon name="upload" /> {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </form>
  );
}

function RenameDialog({ resume, onClose, onSaved }) {
  const toast = useToast();
  const [label, setLabel] = useState(resume.label);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    try {
      const d = await api(`/resumes/${resume._id}`, { method: 'PATCH', body: { label: label.trim() } });
      onSaved(d.resume);
      toast.success('Resume renamed');
      onClose();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Rename resume"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="rename-form" className="btn btn-primary" disabled={busy || !label.trim()}>Save</button>
        </>
      }
    >
      <form id="rename-form" onSubmit={submit}>
        <Field label="Label">{(p) => <input {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />}</Field>
      </form>
    </Modal>
  );
}

export default function Resumes() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi('/resumes');
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const replace = (r) => setData((d) => ({ ...d, items: d.items.map((x) => (x._id === r._id ? r : x)) }));

  const remove = async () => {
    try {
      await api(`/resumes/${deleting._id}`, { method: 'DELETE' });
      setData((d) => ({ ...d, items: d.items.filter((x) => x._id !== deleting._id) }));
      toast.success('Resume deleted');
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Resumes</h1>
          <p className="muted">Keep every version and link the right one to each application.</p>
        </div>
      </div>
      <UploadForm onUploaded={(r) => setData((d) => ({ ...d, items: [r, ...d.items] }))} />

      {data.items.length === 0 ? (
        <EmptyState icon="file" title="No resumes yet">
          Upload your first resume above.
        </EmptyState>
      ) : (
        <div className="resume-grid">
          {data.items.map((r) => (
            <article key={r._id} className="card resume">
              <div className="resume-icon">
                <Icon name="file" size={26} />
              </div>
              <div className="grow">
                <h3>{r.label}</h3>
                <p className="muted small break">{r.originalName}</p>
                <p className="muted small">
                  {formatBytes(r.size)} · uploaded {formatDay(r.createdAt)}
                </p>
                <Link to={`/applications?resume=${r._id}`} className="link small">
                  Used in {r.applicationsCount} application{r.applicationsCount === 1 ? '' : 's'}
                </Link>
              </div>
              <div className="resume-actions">
                {r.mimeType === 'application/pdf' && (
                  <a className="icon-btn" href={apiUrl(`/resumes/${r._id}/download`, { inline: 'true' })} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${r.label}`} title="Preview">
                    <Icon name="link" />
                  </a>
                )}
                <a className="icon-btn" href={apiUrl(`/resumes/${r._id}/download`)} aria-label={`Download ${r.label}`} title="Download">
                  <Icon name="download" />
                </a>
                <button type="button" className="icon-btn" onClick={() => setRenaming(r)} aria-label={`Rename ${r.label}`} title="Rename">
                  <Icon name="edit" />
                </button>
                <button type="button" className="icon-btn danger" onClick={() => setDeleting(r)} aria-label={`Delete ${r.label}`} title="Delete">
                  <Icon name="trash" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {renaming && <RenameDialog resume={renaming} onClose={() => setRenaming(null)} onSaved={replace} />}
      {deleting && (
        <ConfirmDialog
          title="Delete resume?"
          message={`Delete "${deleting.label}"? ${deleting.applicationsCount ? `It will be unlinked from ${deleting.applicationsCount} application(s).` : ''}`}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
