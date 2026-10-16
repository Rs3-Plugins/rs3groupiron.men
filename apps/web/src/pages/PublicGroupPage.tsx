import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { recordGroupView } from '../api/groupClient';
import { GroupMapShell } from '../components/GroupMapShell';

const counted = new Set<string>();

export function PublicGroupPage() {
  const { groupName = '' } = useParams();

  useEffect(() => {
    const key = groupName.toLowerCase();
    if (!key || counted.has(key)) return;
    counted.add(key);
    void recordGroupView(groupName);
  }, [groupName]);

  return <GroupMapShell groupName={groupName} groupToken="" initialTab="map" />;
}
