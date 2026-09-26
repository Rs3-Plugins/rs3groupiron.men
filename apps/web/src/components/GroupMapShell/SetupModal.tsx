import { useState } from 'react';
import { DEMO_GROUP, updateGroupSettings, type AppearanceTheme } from '../../api/groupClient';
import { TOKEN_HINT } from '../../lib/constants';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { Modal } from '../Modal';
import { SetupVideoFrame } from '../SetupVideoFrame';
import { TokenReveal } from '../TokenReveal';
import { Banner } from './PanelChrome';

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
  const { isBusy, error, setError, run } = useAsyncAction('Failed to save setup');

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

    await run('save', async () => {
      let next = { name: groupName, token: groupToken };
      if (trimmed !== groupName) {
        const info = await updateGroupSettings(groupName, groupToken, { name: trimmed });
        next = { name: info.name, token: info.token ?? groupToken };
      }
      onSaved(next);
      onClose();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      titleId="gms-setup-title"
      title="Setup"
      className="gms-modal--setup"
      appearance={appearance}
      closeDisabled={isBusy}
    >
      <div className="gms-modal-body gms-setup-body">
        {error && <Banner tone="error">{error}</Banner>}

        <label>
          Group name
          <input
            value={name}
            disabled={isBusy}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your group name"
          />
        </label>

        <TokenReveal
          token={groupToken}
          disabled={isBusy}
          classNames={TOKEN_CLASSES}
          onCopyError={setError}
          hint={TOKEN_HINT}
        />

        <section className="gms-setup-howto" aria-label="How to setup">
          <h4>How to setup</h4>
          <div className="gms-setup-video">
            <SetupVideoFrame className="gms-setup-video-frame" />
          </div>
        </section>

        <div className="gms-setup-actions">
          <button
            type="button"
            className="gms-settings-text-btn gms-settings-save gms-setup-go"
            disabled={isBusy || !name.trim()}
            onClick={() => void saveAndGo()}
          >
            {isBusy ? 'Saving…' : 'Go to group'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
