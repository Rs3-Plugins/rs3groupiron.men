import { Modal } from '../Modal';
import { RemoveIcon } from './icons';

type RemoveMemberModalProps = {
  name: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RemoveMemberModal({
  name,
  busy,
  onClose,
  onConfirm,
}: RemoveMemberModalProps) {
  return (
    <Modal
      open
      onClose={onClose}
      titleId="gms-remove-member-title"
      title="Remove member"
      closeDisabled={busy}
    >
      <div className="gms-modal-body">
        <p className="gms-modal-copy">
          Remove <strong>{name}</strong> from this group? This cannot be undone from here.
        </p>
        <div className="gms-modal-actions">
          <button type="button" className="gms-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="gms-settings-text-btn gms-settings-danger"
            disabled={busy}
            onClick={onConfirm}
          >
            <RemoveIcon />
            Remove
          </button>
        </div>
      </div>
    </Modal>
  );
}
