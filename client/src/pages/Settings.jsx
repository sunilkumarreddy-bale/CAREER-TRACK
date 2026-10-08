import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import Field from '../components/Field.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState({
    name: user.name,
    followUpDays: user.settings.followUpDays,
    emailReminders: user.settings.emailReminders,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const days = Number(values.followUpDays);
    const found = {};
    if (!values.name.trim()) found.name = 'Name is required';
    if (!Number.isInteger(days) || days < 1 || days > 60) found['settings.followUpDays'] = 'Between 1 and 60 days';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const d = await api('/auth/me', {
        method: 'PATCH',
        body: { name: values.name.trim(), settings: { followUpDays: days, emailReminders: values.emailReminders } },
      });
      setUser(d.user);
      toast.success('Settings saved');
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.fieldErrors);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <h2>Profile & reminders</h2>
      <Field label="Name" error={errors.name}>
        {(p) => <input {...p} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} maxLength={80} />}
      </Field>
      <Field label="Email">{(p) => <input {...p} value={user.email} disabled />}</Field>
      <Field label="Remind me to follow up after (days without activity)" error={errors['settings.followUpDays']}>
        {(p) => <input {...p} type="number" min={1} max={60} value={values.followUpDays} onChange={(e) => setValues({ ...values, followUpDays: e.target.value })} />}
      </Field>
      <label className="check">
        <input type="checkbox" checked={values.emailReminders} onChange={(e) => setValues({ ...values, emailReminders: e.target.checked })} />
        Email me interview reminders and a daily follow-up digest
      </label>
      <p className="muted small">Email delivery requires SMTP to be configured on the server. In-app reminders always work.</p>
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues({ ...values, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (!values.currentPassword) found.currentPassword = 'Required';
    if (values.newPassword.length < 8 || !/[A-Za-z]/.test(values.newPassword) || !/\d/.test(values.newPassword))
      found.newPassword = '8+ characters with a letter and a number';
    if (values.confirm !== values.newPassword) found.confirm = 'Passwords do not match';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: values.currentPassword, newPassword: values.newPassword } });
      toast.success('Password changed. Other devices have been signed out.');
      setValues({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.fieldErrors);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <h2>Change password</h2>
      <Field label="Current password" error={errors.currentPassword}>
        {(p) => <input {...p} type="password" autoComplete="current-password" value={values.currentPassword} onChange={set('currentPassword')} />}
      </Field>
      <Field label="New password" error={errors.newPassword}>
        {(p) => <input {...p} type="password" autoComplete="new-password" value={values.newPassword} onChange={set('newPassword')} />}
      </Field>
      <Field label="Confirm new password" error={errors.confirm}>
        {(p) => <input {...p} type="password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} />}
      </Field>
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}

function DangerZone() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/auth/me', { method: 'DELETE', body: { password } });
      setUser(null);
      navigate('/register', { replace: true });
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <section className="card danger-zone">
      <h2>Delete account</h2>
      <p className="muted">Permanently delete your account, applications, interviews and resumes. This cannot be undone.</p>
      <div>
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      </div>
      {open && (
        <Modal
          title="Delete account?"
          size="sm"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" form="delete-form" className="btn btn-danger" disabled={busy || !password}>
                {busy ? 'Deleting…' : 'Delete everything'}
              </button>
            </>
          }
        >
          <form id="delete-form" onSubmit={remove} className="stack">
            <p>Enter your password to confirm.</p>
            <Field label="Password">{(p) => <input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          </form>
        </Modal>
      )}
    </section>
  );
}

export default function Settings() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Manage your profile, reminders and security.</p>
        </div>
      </div>
      <div className="settings">
        <ProfileForm />
        <PasswordForm />
        <DangerZone />
      </div>
    </>
  );
}
