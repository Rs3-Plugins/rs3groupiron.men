import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchGroupInfo } from '../api/groupClient';
import { AuthError, AuthHeader, CountedField } from '../components/AuthFields';
import { MarketingLayout } from '../components/MarketingLayout';
import { MAX_NAME } from '../lib/constants';
import { writeGroupSession } from '../lib/groupSession';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import '../styles/auth.css';
import './LoginPage.css';

export function LoginPage() {
  useDocumentTitle('Login', { canonicalPath: '/login' });
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const { isBusy, error, setError, run } = useAsyncAction('Could not log in');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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

    await run('login', async () => {
      const info = await fetchGroupInfo(groupName, groupToken);
      writeGroupSession({ name: info.name, token: info.token ?? groupToken });
      navigate('/group', { replace: true });
    });
  }

  return (
    <MarketingLayout className="auth-page" mainClassName="login-content">
      <AuthHeader />
      <h1 className="auth-title">Login</h1>
      <p className="auth-lead">Enter your group name and token to continue.</p>

      <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
        {error && <AuthError>{error}</AuthError>}

        <CountedField
          label="Group name"
          value={name}
          max={MAX_NAME}
          disabled={isBusy}
          autoFocus
          autoComplete="username"
          placeholder={`1–${MAX_NAME} characters`}
          onChange={setName}
        />

        <label className="auth-field">
          Group token
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            disabled={isBusy}
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

        <button type="submit" className="home-btn home-btn--primary auth-submit" disabled={isBusy}>
          {isBusy ? 'Signing in…' : 'Go to group'}
        </button>
      </form>
    </MarketingLayout>
  );
}
