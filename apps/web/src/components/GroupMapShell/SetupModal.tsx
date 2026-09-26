import { useState } from 'react';
import {
  DEMO_GROUP,
  updateGroupSettings,
  type AppearanceTheme,
} from '../../api/groupClient';
import { SETUP_VIDEO_URL } from '../../lib/constants';
import { Modal } from '../Modal';
import { TokenReveal } from '../TokenReveal';

type SetupModalProps = {
  open: boolean;
  appearance?: AppearanceTheme;
  groupName?: string;
  groupToken?: string;
  onClose: () => void;
  onSaved: (next: { name: string; token: string }) => void;
};

const TOKEN_CLASSES = {
  root: 'gms-setup-token',
  label: 'gms-setup-label',
  row: 'gms-setup-token-row',
  code: 'gms-setup-token-value',
  button: 'gms-modal-cancel',
  hint: 'gms-setup-hint',
};

export function SetupModal(props: SetupModalProps) {
  // Mount the form only while open so its draft state resets on every open.
  if (!props.open) return null;
  return <SetupModalBody {...props} />;
}

function SetupModalBody({
  appearance = 'rs3',
  groupName = DEMO_GROUP,
  groupToken = '',
  onClose,
  onSaved,
}: SetupModalProps) {
  const [name, setName] = useState(groupName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAndGo() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Group name is required');
      return;
    }

    // No token means the read-only public demo; renaming it is never allowed.
    if (!groupToken && trimmed !== groupName) {
      setError('This is the read-only demo. Create your own group to rename it.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let nextName = groupName;
      let nextToken = groupToken;
      if (trimmed !== groupName) {
        const info = await updateGroupSettings(groupName, groupToken, {
          name: trimmed,
        });
        nextName = info.name;
        nextToken = info.token ?? groupToken;
      }
      onSaved({ name: nextName, token: nextToken });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save setup');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      titleId="gms-setup-title"
      title="Setup"
      className="gms-modal--setup"
      appearance={appearance}
      closeDisabled={busy}
    >
      <div className="gms-modal-body gms-setup-body">
        {error && <p className="gms-settings-banner gms-settings-banner--error">{error}</p>}

        <label>
          Group name
          <input
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your group name"
          />
        </label>

        <TokenReveal
          token={groupToken}
          disabled={busy}
          classNames={TOKEN_CLASSES}
          onCopyError={setError}
          hint="Use this token in the plugin Authorization header to sync your group."
        />

        <section className="gms-setup-howto" aria-label="How to setup">
          <h4>How to setup</h4>
          <div className="gms-setup-video">
            <iframe
              className="gms-setup-video-frame"
              src={SETUP_VIDEO_URL}
              title="How to setup"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </section>

        <div className="gms-setup-actions">
          <button
            type="button"
            className="gms-settings-text-btn gms-settings-save gms-setup-go"
            disabled={busy || !name.trim()}
            onClick={() => void saveAndGo()}
          >
            {busy ? 'Saving…' : 'Go to group'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
