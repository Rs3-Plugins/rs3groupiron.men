import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createGroup, type GroupMode } from '../api/groupClient';
import { MarketingLayout } from '../components/MarketingLayout';
import { TokenReveal } from '../components/TokenReveal';
import {
  MAX_NAME,
  MAX_SLOTS,
  MIN_SLOTS,
  SETUP_VIDEO_URL,
  SITE_NAME,
} from '../lib/constants';
import { writeGroupSession } from '../lib/groupSession';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import '../styles/auth.css';
import './GetStartedPage.css';

type CreatedGroup = {
  name: string;
  token: string;
};

type MemberField = { id: number; name: string };

let nextFieldId = 0;
function newField(): MemberField {
  nextFieldId += 1;
  return { id: nextFieldId, name: '' };
}

function emptyMembers(size: number) {
  return Array.from({ length: size }, newField);
}

const SLOT_OPTIONS = Array.from(
  { length: MAX_SLOTS - MIN_SLOTS + 1 },
  (_, i) => MIN_SLOTS + i,
);

const TOKEN_CLASSES = {
  root: 'get-started-token',
  label: 'get-started-token-label',
  row: 'get-started-token-row',
  button: 'home-btn',
  hint: 'auth-hint',
};

export function GetStartedPage() {
  useDocumentTitle('Get started', { canonicalPath: '/get-started' });
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slots, setSlots] = useState(MIN_SLOTS);
  const [mode, setMode] = useState<GroupMode>('normal');
  const [members, setMembers] = useState(() => emptyMembers(MIN_SLOTS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedGroup | null>(null);

  function setSlotCount(next: number) {
    setSlots(next);
    setMembers((prev) => {
      if (next === prev.length) return prev;
      if (next > prev.length) {
        return [...prev, ...emptyMembers(next - prev.length)];
      }
      return prev.slice(0, next);
    });
  }

  function setMemberName(id: number, value: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, name: value.slice(0, MAX_NAME) } : m)),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const groupName = name.trim();
    if (groupName.length < 1 || groupName.length > MAX_NAME) {
      setError(`Group name must be 1–${MAX_NAME} characters`);
      return;
    }

    const memberNames = members.map((m) => m.name.trim());
    if (memberNames.some((m) => m.length < 1 || m.length > MAX_NAME)) {
      setError(`Each player username must be 1–${MAX_NAME} characters`);
      return;
    }
    if (new Set(memberNames.map((m) => m.toLowerCase())).size !== memberNames.length) {
      setError('Player usernames must be unique');
      return;
    }

    setBusy(true);
    try {
      const result = await createGroup({
        name: groupName,
        mode,
        member_slots: slots,
        member_names: memberNames,
      });
      setCreated({ name: result.name, token: result.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group');
    } finally {
      setBusy(false);
    }
  }

  function goToGroup() {
    if (!created) return;
    writeGroupSession({ name: created.name, token: created.token });
    navigate('/group', { replace: true });
  }

  return (
    <MarketingLayout className="auth-page" mainClassName="get-started-content">
      <Link className="auth-back" to="/">
        ← Home
      </Link>
      <p className="auth-brand">{SITE_NAME}</p>

      {!created ? (
        <>
          <h1 className="auth-title">Create your group</h1>
          <p className="auth-lead">Name it, size it, add your crew.</p>

          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <div className="get-started-name-row">
              <label className="auth-field auth-field--grow">
                Group name
                <input
                  value={name}
                  maxLength={MAX_NAME}
                  disabled={busy}
                  autoFocus
                  autoComplete="off"
                  placeholder={`1–${MAX_NAME} characters`}
                  onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
                />
                <span className="auth-count">
                  {name.trim().length}/{MAX_NAME}
                </span>
              </label>

              <div
                className={
                  mode === 'competitive'
                    ? 'get-started-mode get-started-mode--competitive'
                    : 'get-started-mode'
                }
                role="group"
                aria-label="Group type"
              >
                <span className="get-started-mode-thumb" aria-hidden />
                <button
                  type="button"
                  className="get-started-mode-btn"
                  disabled={busy}
                  aria-pressed={mode === 'normal'}
                  onClick={() => setMode('normal')}
                >
                  <img src="/group-modes/normal.webp" alt="" width={18} height={18} />
                  <span>Normal</span>
                </button>
                <button
                  type="button"
                  className="get-started-mode-btn"
                  disabled={busy}
                  aria-pressed={mode === 'competitive'}
                  onClick={() => setMode('competitive')}
                >
                  <img
                    src="/group-modes/competitive.webp"
                    alt=""
                    width={18}
                    height={18}
                  />
                  <span>Comp</span>
                </button>
              </div>
            </div>

            <fieldset className="get-started-fieldset" disabled={busy}>
              <legend>Group size</legend>
              <div className="get-started-chips" role="group" aria-label="Group size">
                {SLOT_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      slots === value
                        ? 'get-started-chip get-started-chip--active'
                        : 'get-started-chip'
                    }
                    aria-pressed={slots === value}
                    onClick={() => setSlotCount(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="get-started-fieldset" disabled={busy}>
              <legend>Members</legend>
              <p className="auth-hint">
                RuneScape usernames — {slots} players, 1–{MAX_NAME} chars each.
              </p>
              <div className="get-started-members">
                {members.map((member, index) => (
                  <label key={member.id} className="auth-field">
                    Player {index + 1}
                    <input
                      value={member.name}
                      maxLength={MAX_NAME}
                      disabled={busy}
                      autoComplete="off"
                      placeholder="Username"
                      onChange={(e) => setMemberName(member.id, e.target.value)}
                    />
                    <span className="auth-count">
                      {member.name.trim().length}/{MAX_NAME}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              className="home-btn home-btn--primary auth-submit"
              disabled={busy}
            >
              {busy ? 'Creating…' : 'Create group'}
            </button>
          </form>
        </>
      ) : (
        <div className="auth-form">
          <h1 className="auth-title">You&apos;re set</h1>
          <p className="auth-lead">
            Save your token and watch the setup video, then jump into{' '}
            <strong>{created.name}</strong>.
          </p>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <TokenReveal
            token={created.token}
            classNames={TOKEN_CLASSES}
            onCopyError={setError}
            hint="Use this token in the plugin Authorization header to sync your group."
          />

          <section className="get-started-video" aria-label="How to setup">
            <h2>How to setup</h2>
            <div className="get-started-video-frame">
              <iframe
                src={SETUP_VIDEO_URL}
                title="How to setup"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </section>

          <button
            type="button"
            className="home-btn home-btn--primary auth-submit"
            onClick={goToGroup}
          >
            Go to group
          </button>
        </div>
      )}
    </MarketingLayout>
  );
}
