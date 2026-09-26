import { useSearchParams } from 'react-router-dom';
import { DEMO_GROUP } from '../api/groupClient';
import { GroupMapShell, type ShellTab } from '../components/GroupMapShell';

const TABS: ShellTab[] = [
  'items',
  'map',
  'graphs',
  'ledger',
  'quests',
  'achievements',
  'settings',
];

export function DemoPage() {
  // `?tab=quests` deep-links a section; anything else opens the map.
  const [params] = useSearchParams();
  const requested = params.get('tab');
  const initialTab = TABS.find((t) => t === requested) ?? 'map';

  // Explicit props so /demo always shows the demo group regardless of any
  // saved session. No token: the demo group is publicly readable.
  return (
    <GroupMapShell
      groupName={DEMO_GROUP}
      initialTab={initialTab}
      demoTools
    />
  );
}
