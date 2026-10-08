import Icon from './Icon.jsx';

export default function EmptyState({ icon = 'briefcase', title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty error-state" role="alert">
      <Icon name="alert" size={32} />
      <h3>Couldn't load this</h3>
      <p>{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
