import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGroup, type GroupMode } from '../api/groupClient';
import { AuthError, AuthHeader, CountedField } from '../components/AuthFields';
import { MarketingLayout } from '../components/MarketingLayout';
import { SetupVideoFrame } from '../components/SetupVideoFrame';
import { TokenReveal } from '../components/TokenReveal';
import { MAX_NAME, MAX_SLOTS, MIN_SLOTS, TOKEN_HINT } from '../lib/constants';
import { writeGroupSession } from '../lib/groupSession';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import '../styles/auth.css';
import './GetStartedPage.css';

type MemberField = { id: number; name: string };

let nextFieldId = 0;
function emptyMembers(size: number): MemberField[] {
  return Array.from({ length: size }, () => ({ id: ++nextFieldId, name: '' }));
}

const SLOT_OPTIONS = Array.from({ length: MAX_SLOTS - MIN_SLOTS + 1 }, (_, i) => MIN_SLOTS + i);

const MODES: Array<{ id: GroupMode; label: string; icon: string }> = [
  { id: 'normal', label: 'Normal', icon: '/group-modes/normal.webp' },
  { id: 'competitive', label: 'Comp', icon: '/group-modes/competitive.webp' },
];

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
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const { isBusy, error, setError, run } = useAsyncAction('Could not create group');

  function setSlotCount(next: number) {
    setSlots(next);
    setMembers((prev) => {
      if (next === prev.length) return prev;
      if (next > prev.length) return [...prev, ...emptyMembers(next - prev.length)];
      return prev.slice(0, next);
    });
  }

  function setMemberName(id: number, value: string) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, name: value } : m)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

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

    await run('create', async () => {
      const result = await createGroup({
        name: groupName,
        mode,
        member_slots: slots,
        member_names: memberNames,
      });
      setCreated({ name: result.name, token: result.token });
    });
  }

  function goToGroup() {
    if (!created) return;
    writeGroupSession({ name: created.name, token: created.token });
    navigate('/group', { replace: true });
  }

  return (
    <MarketingLayout className="auth-page" mainClassName="get-started-content">
      <AuthHeader />

      {!created ? (
        <>
          <h1 className="auth-title">Create your group</h1>
          <p className="auth-lead">Name it, size it, add your crew.</p>

          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            {error && <AuthError>{error}</AuthError>}

            <div className="get-started-name-row">
              <CountedField
                label="Group name"
                className="auth-field--grow"
                value={name}
                max={MAX_NAME}
                disabled={isBusy}
                autoFocus
                autoComplete="off"
                placeholder={`1–${MAX_NAME} characters`}
                onChange={setName}
              />

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
                {MODES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="get-started-mode-btn"
                    disabled={isBusy}
                    aria-pressed={mode === option.id}
                    onClick={() => setMode(option.id)}
                  >
                    <img src={option.icon} alt="" width={18} height={18} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="get-started-fieldset" disabled={isBusy}>
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

            <fieldset className="get-started-fieldset" disabled={isBusy}>
              <legend>Members</legend>
              <p className="auth-hint">
                RuneScape usernames — {slots} players, 1–{MAX_NAME} chars each.
              </p>
              <div className="get-started-members">
                {members.map((member, index) => (
                  <CountedField
                    key={member.id}
                    label={`Player ${index + 1}`}
                    value={member.name}
                    max={MAX_NAME}
                    disabled={isBusy}
                    autoComplete="off"
                    placeholder="Username"
                    onChange={(value) => setMemberName(member.id, value)}
                  />
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              className="home-btn home-btn--primary auth-submit"
              disabled={isBusy}
            >
              {isBusy ? 'Creating…' : 'Create group'}
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

          {error && <AuthError>{error}</AuthError>}

          <TokenReveal
            token={created.token}
            classNames={TOKEN_CLASSES}
            onCopyError={setError}
            hint={TOKEN_HINT}
          />

          <section className="get-started-video" aria-label="How to setup">
            <h2>How to setup</h2>
            <div className="get-started-video-frame">
              <SetupVideoFrame />
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
