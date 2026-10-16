import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';

// The marketing pages are a few KB each and share one layout, so splitting them
// only bought a round trip the preload scanner could not see — i.e. a visible
// "Loading…" on the landing page. They ship in the entry chunk instead.
import { GroupSkeleton } from './components/GroupSkeleton';
import { BrowsePage } from './pages/BrowsePage';
import { GetStartedPage } from './pages/GetStartedPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

// These three are worth splitting: they pull in GroupMapShell (~385 KB) and
// GraphsPanel (~366 KB), neither of which a first-time visitor needs.
const DemoPage = lazy(() =>
  import('./pages/DemoPage').then((m) => ({ default: m.DemoPage })),
);
const GroupPage = lazy(() =>
  import('./pages/GroupPage').then((m) => ({ default: m.GroupPage })),
);
const PublicGroupPage = lazy(() =>
  import('./pages/PublicGroupPage').then((m) => ({ default: m.PublicGroupPage })),
);

const FALLBACK = <GroupSkeleton />;

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={FALLBACK}>
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="get-started" element={<GetStartedPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="discover" element={<BrowsePage />} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="group" element={<GroupPage />} />
          {/* Somebody else's public group: the name is in the path because the
              shell owns the query string. */}
          <Route path="g/:groupName" element={<PublicGroupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Analytics />
    </BrowserRouter>
  );
}
