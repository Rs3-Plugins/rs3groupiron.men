import type { GroupShares, GroupVisibility } from '../../api/groupClient';
import { SHARE_FIELDS } from '../../lib/groupShares';
import { Segmented } from './Segmented';

type VisibilitySectionProps = {
  visibility: GroupVisibility;
  shares: GroupShares;
  busy: boolean;
  publicUrl: string;
  onSelectVisibility: (visibility: GroupVisibility) => void;
  onToggleShare: (key: keyof GroupShares, on: boolean) => void;
};

const VISIBILITIES = [
  { id: 'private', label: 'Private' },
  { id: 'public', label: 'Public' },
] as const;

export function VisibilitySection({
  visibility,
  shares,
  busy,
  publicUrl,
  onSelectVisibility,
  onToggleShare,
}: VisibilitySectionProps) {
  const isPublic = visibility === 'public';

  return (
    <section className="gms-panel gms-settings-card">
      <div className="gms-settings-card-head">
        <h2 className="gms-section-title">Visibility</h2>
        <span className="gms-settings-hint">
          Private groups can only be opened with your token. Public groups can be found by
          name — you choose what shows.
        </span>
      </div>

      <div className="gms-settings-grid">
        <span className="gms-settings-label">Who can see it</span>
        <div className="gms-settings-stack">
          <Segmented
            options={VISIBILITIES}
            value={visibility}
            ariaLabel="Who can see it"
            onChange={onSelectVisibility}
          />
          <span className="gms-settings-note">
            {isPublic
              ? `Anyone can watch this group at ${publicUrl}`
              : 'Nobody can open this group without the token.'}
          </span>
        </div>

        {isPublic && (
          <>
            <span className="gms-settings-label">What to share</span>
            <div className="gms-settings-stack">
              <span className="gms-settings-note">
                The live map stays off unless you turn it on: it shows where each member is
                standing right now.
              </span>
              <div className="gms-settings-shares">
                {SHARE_FIELDS.map((field) => (
                  <label key={field.key} className="gms-settings-share">
                    <input
                      type="checkbox"
                      checked={shares[field.key]}
                      disabled={busy}
                      onChange={(e) => onToggleShare(field.key, e.target.checked)}
                    />
                    <span className="gms-settings-share-text">
                      <strong>{field.label}</strong>
                      <em>{field.hint}</em>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
