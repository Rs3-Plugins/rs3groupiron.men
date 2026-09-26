import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

// The marketing pages are a few KB each and share one layout, so splitting them
// only bought a round trip the preload scanner could not see — i.e. a visible
// "Loading…" on the landing page. They ship in the entry chunk instead.
import { GroupSkeleton } from './components/GroupSkeleton';
import { GetStartedPage } from './pages/GetStartedPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

// These two are worth splitting: they pull in GroupMapShell (~385 KB) and
// GraphsPanel (~366 KB), neither of which a first-time visitor needs.
const DemoPage = lazy(() =>
  import('./pages/DemoPage').then((m) => ({ default: m.DemoPage })),
);
const GroupPage = lazy(() =>
  import('./pages/GroupPage').then((m) => ({ default: m.GroupPage })),
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
          <Route path="demo" element={<DemoPage />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
