import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ConfirmProvider, ToastProvider } from './components/ui';
import { useLive } from './lib/hooks';
import { getSettings } from './db/repo';
import { Welcome } from './pages/Welcome';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectWorkspace } from './pages/project/ProjectWorkspace';
import { ToolsIndex, ToolPage } from './pages/tools/Tools';
import { Academy, SubjectPage } from './pages/Academy';
import { Mistakes } from './pages/Mistakes';
import { Assistant } from './pages/Assistant';
import { SettingsPage } from './pages/Settings';
import { PrintReport } from './pages/project/PrintReport';

export function App() {
  const settings = useLive(getSettings);
  if (!settings) return <div style={{ minHeight: '100vh', background: 'var(--ivory)' }} />;
  return (
    <ToastProvider>
      <ConfirmProvider>
        <HashRouter>
          {!settings.welcomeSeen ? (
            <Welcome />
          ) : (
            <Routes>
              <Route path="/print/:id" element={<PrintReport />} />
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectWorkspace />} />
                <Route path="projects/:id/:tab" element={<ProjectWorkspace />} />
                <Route path="tools" element={<ToolsIndex />} />
                <Route path="tools/:toolId" element={<ToolPage />} />
                <Route path="academy" element={<Academy />} />
                <Route path="academy/:subjectId" element={<SubjectPage />} />
                <Route path="mistakes" element={<Mistakes />} />
                <Route path="assistant" element={<Assistant />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          )}
        </HashRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
