import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Field from '../components/Field.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth">
      <section className="auth-hero" aria-hidden="true">
        <div>
          <img src="/favicon.svg" alt="" width="44" height="44" />
          <h1>CareerTrack</h1>
          <p>One platform. Complete visibility. Zero missed opportunities.</p>
          <ul>
            <li>Track every application from Applied to Offer</li>
            <li>Never miss an interview or follow-up</li>
            <li>Know which resume gets you interviews</li>
          </ul>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
          {children}
        </div>
      </section>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!values.email || !values.password) return setError('Enter your email and password');
    setBusy(true);
    setError('');
    try {
      await login(values.email, values.password);
      const from = location.state?.from;
      navigate(typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue to your job tracker.">
      <form onSubmit={submit} className="stack" noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Email">
          {(p) => <input {...p} type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />}
        </Field>
        <Field label="Password">
          {(p) => (
            <input {...p} type="password" autoComplete="current-password" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} />
          )}
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="auth-switch">
        Don't have an account? <Link to="/register">Create one</Link>
      </p>
    </AuthShell>
  );
}
