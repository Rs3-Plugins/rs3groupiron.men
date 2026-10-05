import { DEMO_GROUP } from '../api/groupClient';
import { GroupMapShell } from '../components/GroupMapShell';

export function DemoPage() {
  // Explicit props so /demo always shows the demo group regardless of any
  // saved session. No token: the demo group is publicly readable.
  return <GroupMapShell groupName={DEMO_GROUP} demoTools />;
}
