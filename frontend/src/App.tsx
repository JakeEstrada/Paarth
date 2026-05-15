import type { JSX } from 'react';
import { Box, useTheme } from '@mui/material';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';
import ViewModeFrame from './components/layout/ViewModeFrame';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ForgotUsernamePage from './pages/ForgotUsernamePage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsAndConditions from './pages/TermsAndConditions';
import SmsConsentPage from './pages/SmsConsentPage';
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
import CommissionLogsPage from './pages/CommissionLogsPage';
import UsersPage from './pages/UsersPage';
import BillsPage from './pages/BillsPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import PdfViewerPage from './pages/PdfViewerPage';
import PictureViewerPage from './pages/PictureViewerPage';
import FinanceHubPage from './pages/FinanceHubPage';
import TakeoffSheetPage from './pages/TakeoffSheetPage';
import MessagePage from './pages/MessagePage';

function App(): JSX.Element | null {
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
          ? `linear-gradient(135deg, ${theme.palette.background.default} 0%, ${theme.palette.background.paper} 100%)`
          : 'linear-gradient(135deg, #E9EEF3 0%, #DEE7F0 100%)',
      }}
    >
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/pipeline" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/pipeline" replace /> : <RegisterPage />} />
        <Route path="/forgot-password" element={user ? <Navigate to="/pipeline" replace /> : <ForgotPasswordPage />} />
        <Route path="/forgot-username" element={user ? <Navigate to="/pipeline" replace /> : <ForgotUsernamePage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/sms-consent" element={<SmsConsentPage />} />
        <Route
          path="/calendar-view"
          element={
            <ProtectedRoute>
              <ViewModeFrame currentView="calendar">
                <CalendarPage tvMode externalViewControls />
              </ViewModeFrame>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pipeline-view"
          element={
            <ProtectedRoute>
              <ViewModeFrame currentView="pipeline">
                <PipelinePage tvMode externalViewControls />
              </ViewModeFrame>
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers-view"
          element={
            <ProtectedRoute>
              <ViewModeFrame currentView="customers">
                <CustomersPage viewMode externalViewControls />
              </ViewModeFrame>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pdf/:fileId"
          element={
            <ProtectedRoute>
              <PdfViewerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/picture/:fileId"
          element={
            <ProtectedRoute>
              <PictureViewerPage />
            </ProtectedRoute>
          }
        />
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
                  <Route path="/documents" element={<DocumentsPage />} />
                  <Route path="/messages" element={<MessagePage />} />
                  <Route path="/dead-estimates" element={<JobArchivePage />} />
                  <Route path="/archive" element={<JobArchivePage />} />
                  <Route path="/completed-appointments" element={<CompletedAppointmentsPage />} />
                  <Route path="/completed-jobs" element={<CompletedJobsPage />} />
                  <Route path="/completed-tasks" element={<CompletedTasksPage />} />
                  <Route path="/developer" element={<DeveloperTasksPage />} />
                  <Route path="/payroll" element={<PayrollPage />} />
                  <Route path="/commission-logs" element={<CommissionLogsPage />} />
                  <Route path="/bills" element={<BillsPage />} />
                  <Route path="/finance" element={<FinanceHubPage />} />
                  <Route path="/takeoff-sheet" element={<TakeoffSheetPage />} />
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
