import { useEffect, useId, useRef, useState } from 'react';
import { maskKey, validateKey } from '../lib/apiKey.js';

/**
 * Where the visitor supplies their Google Maps key.
 *
 * Two variants:
 *   - `setup`   — full page, shown when there is no key at all. Not dismissible;
 *                 nothing else can render without a key.
 *   - `overlay` — a dialog over the running app, for changing or clearing a key.
 */
export default function KeyGate({
  variant = 'setup',
  currentKey = '',
  source = 'none',
  hasBuildKey = false,
  persistFailed = false,
  loadError = null,
  onSubmit,
  onCancel,
  onForget,
}) {
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [problem, setProblem] = useState(null);
  const [warning, setWarning] = useState(null);
  const inputRef = useRef(null);
  const inputId = useId();
  const isOverlay = variant === 'overlay';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    const result = validateKey(value);
    if (!result.ok) {
      setProblem(result.error);
      setWarning(null);
      inputRef.current?.focus();
      return;
    }
    setProblem(null);
    setWarning(result.warning);
    onSubmit?.(value.trim());
  };

  const handleKeyDown = (event) => {
    if (isOverlay && event.key === 'Escape') onCancel?.();
  };

  const form = (
    <form className="keyform" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      <h1 className="keyform__title" id={`${inputId}-title`}>
        Land<span className="brand__mark-alt">Master</span>
      </h1>

      <p className="keyform__lede">
        {loadError
          ? 'Google Maps rejected that key, or it could not load.'
          : isOverlay
            ? 'Replace the Google Maps key this browser uses.'
            : 'Land Master needs a Google Maps browser key. It stays on this device.'}
      </p>

      {loadError && <p className="keyform__loaderr" data-mono>{loadError}</p>}

      <label className="keyform__label" htmlFor={inputId}>
        Google Maps API key
      </label>

      <div className="keyform__field">
        <input
          ref={inputRef}
          id={inputId}
          className="keyform__input"
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (problem) setProblem(null);
          }}
          placeholder="AIza…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          aria-invalid={problem ? 'true' : undefined}
          aria-describedby={problem ? `${inputId}-error` : `${inputId}-help`}
        />
        <button
          type="button"
          className="keyform__reveal"
          onClick={() => setRevealed((shown) => !shown)}
          aria-pressed={revealed}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>

      {problem && (
        <p className="keyform__error" id={`${inputId}-error`} role="alert">
          {problem}
        </p>
      )}
      {warning && !problem && <p className="keyform__warn">{warning}</p>}

      <div className="keyform__actions">
        <button type="submit" className="btn btn--primary">
          {isOverlay ? 'Save and reload' : 'Load the map'}
        </button>
        {isOverlay && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      {isOverlay && currentKey && (
        <p className="keyform__current">
          In use: <code data-mono>{maskKey(currentKey)}</code>{' '}
          <span className="keyform__source">
            {source === 'stored' ? 'saved in this browser' : 'built into this site'}
          </span>
          {source === 'stored' && (
            <>
              {' · '}
              <button type="button" className="linkbtn" onClick={onForget}>
                {hasBuildKey ? 'forget it and use the site’s key' : 'forget it'}
              </button>
            </>
          )}
        </p>
      )}

      {persistFailed && (
        <p className="keyform__warn">
          This browser wouldn’t save the key (private mode or blocked storage), so it will be
          forgotten when the tab closes.
        </p>
      )}

      <div className="keyform__help" id={`${inputId}-help`}>
        <p className="keyform__help-title">Getting a key</p>
        <ol className="keyform__steps">
          <li>
            In the Google Cloud console, enable <strong>Maps JavaScript API</strong> and{' '}
            <strong>Places API (New)</strong>.
          </li>
          <li>
            Create an API key under <em>APIs &amp; Services → Credentials</em>.
          </li>
          <li>
            Restrict it to your own sites under <em>Application restrictions → Websites</em>, and to
            those two APIs.
          </li>
        </ol>
        <p className="keyform__note">
          The key is kept in this browser’s local storage and is sent only to Google when the map
          loads. It is never transmitted anywhere else — Land Master has no backend.
        </p>
      </div>
    </form>
  );

  if (!isOverlay) return <main className="keygate">{form}</main>;

  return (
    <div className="keygate keygate--overlay" role="dialog" aria-modal="true" aria-label="Change API key">
      <div className="keygate__scrim" onClick={onCancel} aria-hidden="true" />
      <div className="keygate__dialog">{form}</div>
    </div>
  );
}
