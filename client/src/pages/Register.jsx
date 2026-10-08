import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import Field from '../components/Field.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthShell } from './Login.jsx';

function validate(v) {
  const e = {};
  if (!v.name.trim()) e.name = 'Name is required';
  if (!/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Enter a valid email';
  if (v.password.length < 8) e.password = 'At least 8 characters';
  else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) e.password = 'Use at least one letter and one number';
  if (v.confirm !== v.password) e.confirm = 'Passwords do not match';
  return e;
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues({ ...values, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError('');
    try {
      await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.fieldErrors);
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start tracking your job search in minutes.">
      <form onSubmit={submit} className="stack" noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Full name" error={errors.name}>
          {(p) => <input {...p} autoComplete="name" value={values.name} onChange={set('name')} maxLength={80} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => <input {...p} type="email" autoComplete="email" value={values.email} onChange={set('email')} />}
        </Field>
        <Field label="Password" error={errors.password} hint="8+ characters with a letter and a number">
          {(p) => <input {...p} type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />}
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          {(p) => <input {...p} type="password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} />}
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}
