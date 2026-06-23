/**
 * ResetPasswordPage — Set a new password from email token (?token=).
 * Route: /reset-password
 * API: POST /auth/reset-password
 * Docs: ../../../docs/PAGES.md#resetpasswordpagetsx
 */
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Container,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Lock as LockIcon,
  ArrowBack as ArrowBackIcon,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import BrandLogo from '../components/common/BrandLogo';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error('Invalid reset link. Please request a new one.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      toast.error('Please enter and confirm your new password');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, { token, newPassword });
      setCompleted(true);
      toast.success('Password updated successfully');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.error
          ? error.response.data.error
          : 'Failed to reset password';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: 2,
        }}
      >
        <Container maxWidth="sm">
          <Card sx={{ boxShadow: '0 8px 32px rgba(0,0,0,0.1)', borderRadius: 3 }}>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
                Invalid Reset Link
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                This password reset link is missing or invalid. Request a new one from the login page.
              </Typography>
              <Button
                component={Link}
                to="/forgot-password"
                variant="contained"
                sx={{ textTransform: 'none', mr: 1 }}
              >
                Request New Link
              </Button>
              <Button component={Link} to="/login" sx={{ textTransform: 'none' }}>
                Back to Login
              </Button>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  if (completed) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: 2,
        }}
      >
        <Container maxWidth="sm">
          <Card sx={{ boxShadow: '0 8px 32px rgba(0,0,0,0.1)', borderRadius: 3 }}>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
                Password Updated
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Your password has been reset. You can now sign in with your new password.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate('/login')}
                sx={{ textTransform: 'none' }}
              >
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 2,
      }}
    >
      <Container maxWidth="sm">
        <Card sx={{ boxShadow: '0 8px 32px rgba(0,0,0,0.1)', borderRadius: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <BrandLogo
                alt="Liminnality"
                sx={{
                  height: 80,
                  width: 80,
                  objectFit: 'contain',
                  mb: 2,
                }}
              />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1976d2' }}>
                Reset Password
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Enter a new password for your account
              </Typography>
            </Box>

            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                margin="normal"
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword((v) => !v)} edge="end">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                fullWidth
                label="Confirm New Password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                margin="normal"
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 3 }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: 2,
                  mb: 2,
                }}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>

              <Button
                component={Link}
                to="/login"
                fullWidth
                startIcon={<ArrowBackIcon />}
                sx={{ textTransform: 'none' }}
              >
                Back to Login
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

export default ResetPasswordPage;
