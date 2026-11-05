import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { LockScreen } from './components/LockScreen';
import { useStore } from './state/store';
import Dashboard from './pages/Dashboard';
import { AutoSync } from './connectors/sync';

const NetWorthPage = lazy(() => import('./pages/NetWorth'));
const SpendingPage = lazy(() => import('./pages/Spending'));
const MetalPage = lazy(() => import('./pages/Metal'));
const PortfolioPage = lazy(() => import('./pages/Portfolio'));
const AssistantPage = lazy(() => import('./pages/Assistant'));
const OpportunitiesPage = lazy(() => import('./pages/Opportunities'));
const GoalsPage = lazy(() => import('./pages/Goals'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const ConnectionsPage = lazy(() => import('./pages/Connections'));
const SettingsPage = lazy(() => import('./pages/Settings'));

export default function App() {
  const { status } = useStore();
  if (status !== 'ready') return <LockScreen />;
  return (
    <Layout>
      <AutoSync />
      <Suspense fallback={<div className="grid h-64 place-items-center text-muted"><Loader2 className="animate-spin" /></div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/patrimonio" element={<NetWorthPage />} />
          <Route path="/spese" element={<SpendingPage />} />
          <Route path="/revolut-metal" element={<MetalPage />} />
          <Route path="/investimenti" element={<PortfolioPage />} />
          <Route path="/assistente" element={<AssistantPage />} />
          <Route path="/opportunita" element={<OpportunitiesPage />} />
          <Route path="/obiettivi" element={<GoalsPage />} />
          <Route path="/notifiche" element={<NotificationsPage />} />
          <Route path="/connessioni/*" element={<ConnectionsPage />} />
          <Route path="/impostazioni" element={<SettingsPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
