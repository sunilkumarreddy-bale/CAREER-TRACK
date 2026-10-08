import { useId } from 'react';

/** Label + control + error message. The child receives id/aria props via render function. */
export default function Field({ label, error, hint, children, className = '' }) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': describedBy })}
      {error ? (
        <span className="field-error" id={`${id}-err`}>
          {error}
        </span>
      ) : (
        hint && (
          <span className="field-hint" id={`${id}-hint`}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}
