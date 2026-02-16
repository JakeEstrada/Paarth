import { Box, useTheme } from '@mui/material';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ForgotUsernamePage from './pages/ForgotUsernamePage';
import PipelinePage from './pages/PipelinePage';
import JobArchivePage from './pages/JobArchivePage';
import CompletedAppointmentsPage from './pages/CompletedAppointmentsPage';
import CompletedJobsPage from './pages/CompletedJobsPage';
import CompletedTasksPage from './pages/CompletedTasksPage';
import CalendarPage from './pages/CalendarPageNew';
import TasksPage from './pages/TasksPage';
import DeveloperTasksPage from './pages/DeveloperTasksPage';
import CustomersPage from './pages/CustomersPage';
import PayrollPage from './pages/PayrollPage';
import UsersPage from './pages/UsersPage';
import BillsPage from './pages/BillsPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  const { user, loading } = useAuth();
  const theme = useTheme();

  if (loading) {
    return null; // Loading handled by ProtectedRoute
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: theme.palette.mode === 'dark'
          ? '#121212'
          : 'linear-gradient(135deg, #F5F7FA 0%, #E8EAF6 100%)',
      }}
    >
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/pipeline" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/pipeline" replace /> : <RegisterPage />} />
        <Route path="/forgot-password" element={user ? <Navigate to="/pipeline" replace /> : <ForgotPasswordPage />} />
        <Route path="/forgot-username" element={user ? <Navigate to="/pipeline" replace /> : <ForgotUsernamePage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/pipeline" element={<PipelinePage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/dead-estimates" element={<JobArchivePage />} />
                  <Route path="/archive" element={<JobArchivePage />} />
                  <Route path="/completed-appointments" element={<CompletedAppointmentsPage />} />
                  <Route path="/completed-jobs" element={<CompletedJobsPage />} />
                  <Route path="/completed-tasks" element={<CompletedTasksPage />} />
                  <Route path="/developer" element={<DeveloperTasksPage />} />
                  <Route path="/payroll" element={<PayrollPage />} />
                  <Route path="/bills" element={<BillsPage />} />
                  <Route path="/users" element={<ProtectedRoute requireAdmin><UsersPage /></ProtectedRoute>} />
                  <Route path="/account-settings" element={<AccountSettingsPage />} />
                </Routes>
              </MainLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Box>
  );
}

export default App;
