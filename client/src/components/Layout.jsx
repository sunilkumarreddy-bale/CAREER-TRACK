import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDateTime } from '../utils/format.js';
import Icon from './Icon.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/applications', label: 'Applications', icon: 'list' },
  { to: '/board', label: 'Pipeline', icon: 'board' },
  { to: '/interviews', label: 'Interviews', icon: 'calendar' },
  { to: '/resumes', label: 'Resumes', icon: 'file' },
  { to: '/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const reminders = useApi('/reminders');
  const { reload: reloadReminders } = reminders;
  const firstRender = useRef(true);

  useEffect(() => {
    setMenuOpen(false);
    setBellOpen(false);
    if (firstRender.current) firstRender.current = false;
    else reloadReminders();
  }, [location.pathname, reloadReminders]);

  useEffect(() => {
    if (!bellOpen) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !e.target.closest('.bell-wrap')) setBellOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [bellOpen]);

  const count = reminders.data?.count ?? 0;

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>CareerTrack</span>
        </Link>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="me">
            <span className="avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="me-text">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </div>
          <button type="button" className="nav-link" onClick={doLogout}>
            <Icon name="logout" />
            <span>Log out</span>
          </button>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <div className="main-col">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={menuOpen}>
            <Icon name="menu" />
          </button>
          <Link to="/" className="brand brand-mobile">
            <img src="/favicon.svg" alt="" width="24" height="24" />
            <span>CareerTrack</span>
          </Link>
          <div className="topbar-spacer" />
          <div className="bell-wrap">
            <button
              type="button"
              className="icon-btn bell"
              aria-label={`Reminders (${count})`}
              aria-expanded={bellOpen}
              onClick={() => setBellOpen((o) => !o)}
            >
              <Icon name="bell" />
              {count > 0 && <span className="bell-count">{count > 99 ? '99+' : count}</span>}
            </button>
            {bellOpen && (
              <div className="popover" role="dialog" aria-label="Reminders">
                <h3>Reminders</h3>
                {count === 0 && <p className="muted">You're all caught up.</p>}
                {reminders.data?.upcomingInterviews.map((i) => (
                  <Link key={i._id} to="/interviews" className="popover-item">
                    <Icon name="calendar" />
                    <span>
                      <strong>{i.application?.company}</strong> – {i.round} interview
                      <small>{formatDateTime(i.scheduledAt)}</small>
                    </span>
                  </Link>
                ))}
                {reminders.data?.followUps.map((a) => (
                  <Link key={a.id} to={`/applications/${a.id}`} className="popover-item">
                    <Icon name="clock" />
                    <span>
                      <strong>{a.company}</strong> – follow up
                      <small>No response for {a.daysSinceActivity} days</small>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </header>
        <main id="main" className="content">
          <Outlet context={{ reloadReminders }} />
        </main>
      </div>
    </div>
  );
}
