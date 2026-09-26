import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
);
const GetStartedPage = lazy(() =>
  import('./pages/GetStartedPage').then((m) => ({ default: m.GetStartedPage })),
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const DemoPage = lazy(() =>
  import('./pages/DemoPage').then((m) => ({ default: m.DemoPage })),
);
const GroupPage = lazy(() =>
  import('./pages/GroupPage').then((m) => ({ default: m.GroupPage })),
);

// Minimal inline fallback: pages have their own chrome, so keep this neutral.
const FALLBACK = (
  <div
    style={{
      minHeight: '100dvh',
      padding: '2rem',
      background: '#0c0e10',
      color: '#a8b0b8',
      textAlign: 'center',
    }}
    aria-busy
  >
    Loading…
  </div>
);

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
