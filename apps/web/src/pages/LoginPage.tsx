import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchGroupInfo } from '../api/groupClient';
import { MarketingLayout } from '../components/MarketingLayout';
import { MAX_NAME, SITE_NAME } from '../lib/constants';
import { writeGroupSession } from '../lib/groupSession';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import '../styles/auth.css';
import './LoginPage.css';

export function LoginPage() {
  useDocumentTitle('Login', { canonicalPath: '/login' });
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const groupName = name.trim();
    const groupToken = token.trim();

    if (groupName.length < 1 || groupName.length > MAX_NAME) {
      setError(`Group name must be 1–${MAX_NAME} characters`);
      return;
    }
    if (!groupToken) {
      setError('Group token is required');
      return;
    }

    setBusy(true);
    try {
      const info = await fetchGroupInfo(groupName, groupToken);
      writeGroupSession({
        name: info.name,
        token: info.token ?? groupToken,
      });
      navigate('/group', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <MarketingLayout className="auth-page" mainClassName="login-content">
      <Link className="auth-back" to="/">
        ← Home
      </Link>
      <p className="auth-brand">{SITE_NAME}</p>
      <h1 className="auth-title">Login</h1>
      <p className="auth-lead">Enter your group name and token to continue.</p>

      <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <label className="auth-field">
          Group name
          <input
            value={name}
            maxLength={MAX_NAME}
            disabled={busy}
            autoFocus
            autoComplete="username"
            placeholder={`1–${MAX_NAME} characters`}
            onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
          />
          <span className="auth-count">
            {name.trim().length}/{MAX_NAME}
          </span>
        </label>

        <label className="auth-field">
          Group token
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            disabled={busy}
            autoComplete="current-password"
            spellCheck={false}
            placeholder="Paste your group token"
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            type="button"
            className="auth-field-toggle"
            aria-pressed={showToken}
            aria-label={showToken ? 'Hide token' : 'Show token'}
            onClick={() => setShowToken((v) => !v)}
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </label>

        <button
          type="submit"
          className="home-btn home-btn--primary auth-submit"
          disabled={busy}
        >
          {busy ? 'Signing in…' : 'Go to group'}
        </button>
      </form>
    </MarketingLayout>
  );
}
