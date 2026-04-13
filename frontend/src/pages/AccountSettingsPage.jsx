import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  TextField,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Chip,
  Grid,
} from '@mui/material';
import {
  Person as PersonIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Input as InputIcon,
  PhotoCamera as PhotoCameraIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';
import BrandLogo from '../components/common/BrandLogo';
import { useTheme } from '@mui/material/styles';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function AccountSettingsPage() {
  const { user: currentUser, fetchCurrentUser, isSuperAdmin, tenantForBranding } = useAuth();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: '',
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [uploadingLogoLight, setUploadingLogoLight] = useState(false);
  const [uploadingLogoDark, setUploadingLogoDark] = useState(false);
  const [resettingEstimates, setResettingEstimates] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const user = response.data.user;
      setUserData(user);
      setProfileForm({
        name: user.name || '',
      });
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast.error('Failed to load account data');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async () => {
    if (!profileForm.name.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      setUpdating(true);
      const token = localStorage.getItem('accessToken');
      await axios.patch(`${API_URL}/auth/profile`, {
        name: profileForm.name,
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      toast.success('Profile updated successfully');
      await fetchUserData();
      // Update AuthContext user
      if (token && fetchCurrentUser) {
        await fetchCurrentUser(token);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };

  const handleTenantLogoUpload = async (e, themeMode) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      e.target.value = '';
      return;
    }
    try {
      if (themeMode === 'dark') setUploadingLogoDark(true);
      else setUploadingLogoLight(true);
      const formData = new FormData();
      formData.append('logo', file);
      await api.post(`/tenants/logo/${themeMode}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Organization ${themeMode} logo updated. It will appear for everyone in your company.`);
      try {
        localStorage.setItem('tenantLogoCacheBust', String(Date.now()));
      } catch {
        /* ignore */
      }
      const token = localStorage.getItem('accessToken');
      if (token && fetchCurrentUser) {
        await fetchCurrentUser(token);
      }
    } catch (error) {
      console.error('Logo upload:', error);
      toast.error(error.response?.data?.error || 'Failed to upload logo');
    } finally {
      setUploadingLogoLight(false);
      setUploadingLogoDark(false);
      e.target.value = '';
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('All password fields are required');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    try {
      setChangingPassword(true);
      const token = localStorage.getItem('accessToken');
      await axios.patch(`${API_URL}/auth/change-password`, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      toast.success('Password changed successfully');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error(error.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleResetAllEstimates = async () => {
    if (!isSuperAdmin()) return;
    const confirmed = window.confirm(
      'This will permanently remove ALL estimate snapshots/history for your organization. Continue?'
    );
    if (!confirmed) return;

    try {
      setResettingEstimates(true);
      const token = localStorage.getItem('accessToken');
      const { data } = await axios.post(
        `${API_URL}/jobs/admin/reset-estimates`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Clear browser-only estimate caches on this machine.
      localStorage.removeItem('financeHubSavedEstimateSnapshots');
      localStorage.removeItem('financeHubEstimateSequence');
      localStorage.removeItem('financeHubEstimateDescriptionHints');

      toast.success(`Estimate data reset. Updated ${data?.modified ?? 0} job(s).`);
    } catch (error) {
      console.error('Error resetting estimate history:', error);
      toast.error(error.response?.data?.error || 'Failed to reset estimate history');
    } finally {
      setResettingEstimates(false);
    }
  };

  const getRoleColor = (role) => {
    const colors = {
      super_admin: 'error',
      admin: 'warning',
      manager: 'info',
      sales: 'primary',
      installer: 'success',
      read_only: 'default',
      employee: 'secondary',
    };
    return colors[role] || 'default';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          Account Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your account information and security settings
        </Typography>
      </Box>

      {/* Account Information Section */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: '16px',
          p: 4,
          mb: 3,
          background: theme.palette.background.paper,
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 2px 12px rgba(0, 0, 0, 0.35)'
              : '0 2px 12px rgba(0, 0, 0, 0.06)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <PersonIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Account Information
          </Typography>
        </Box>

        {userData && (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Email
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {userData.email}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Email cannot be changed
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Name"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                fullWidth
                required
                helperText="This name is used in activity and update logs."
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Role
                </Typography>
                <Chip
                  label={userData.role?.replace('_', ' ').toUpperCase() || 'N/A'}
                  color={getRoleColor(userData.role)}
                  size="small"
                />
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Account Status
                </Typography>
                <Chip
                  label={userData.isActive ? 'Active' : 'Inactive'}
                  color={userData.isActive ? 'success' : 'default'}
                  size="small"
                />
              </Box>
            </Grid>

            {userData.createdAt && (
              <Grid item xs={12} sm={6}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Account Created
                  </Typography>
                  <Typography variant="body2">
                    {new Date(userData.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Typography>
                </Box>
              </Grid>
            )}

            {userData.updatedAt && (
              <Grid item xs={12} sm={6}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Last Updated
                  </Typography>
                  <Typography variant="body2">
                    {new Date(userData.updatedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Typography>
                </Box>
              </Grid>
            )}

            <Grid item xs={12}>
              <Button
                variant="contained"
                onClick={handleProfileUpdate}
                disabled={updating || profileForm.name === userData.name}
                sx={{ mt: 1 }}
              >
                {updating ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
                Save Changes
              </Button>
            </Grid>
          </Grid>
        )}
      </Paper>

      {isSuperAdmin() && (
        <Paper
          elevation={0}
          sx={{
            borderRadius: '16px',
            p: 4,
            mb: 3,
            background: theme.palette.background.paper,
            boxShadow:
              theme.palette.mode === 'dark'
                ? '0 2px 12px rgba(0, 0, 0, 0.35)'
                : '0 2px 12px rgba(0, 0, 0, 0.06)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <PhotoCameraIcon sx={{ fontSize: 28, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Organization logo
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload your company logo. It appears in the sidebar, login screen (for your team), payroll, and printed reports for all users in your organization. PNG, JPG, GIF, WebP, or SVG. Max 2&nbsp;MB.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary">Light logo</Typography>
              <BrandLogo
                tenant={tenantForBranding}
                themeMode="light"
                alt="Light theme organization logo"
                sx={{
                  height: 80,
                  width: 80,
                  objectFit: 'contain',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 0.5,
                }}
              />
              <Button
                variant="outlined"
                component="label"
                disabled={uploadingLogoLight}
                startIcon={uploadingLogoLight ? <CircularProgress size={18} /> : <PhotoCameraIcon />}
              >
                {uploadingLogoLight ? 'Uploading…' : 'Upload light'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                  hidden
                  onChange={(e) => handleTenantLogoUpload(e, 'light')}
                />
              </Button>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary">Dark logo</Typography>
              <BrandLogo
                tenant={tenantForBranding}
                themeMode="dark"
                alt="Dark theme organization logo"
                sx={{
                  height: 80,
                  width: 80,
                  objectFit: 'contain',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 0.5,
                }}
              />
              <Button
                variant="outlined"
                component="label"
                disabled={uploadingLogoDark}
                startIcon={uploadingLogoDark ? <CircularProgress size={18} /> : <PhotoCameraIcon />}
              >
                {uploadingLogoDark ? 'Uploading…' : 'Upload dark'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                  hidden
                  onChange={(e) => handleTenantLogoUpload(e, 'dark')}
                />
              </Button>
            </Box>
          </Box>
          <Divider sx={{ my: 3 }} />
          <Alert severity="warning" sx={{ mb: 2 }}>
            Temporary tool: clears all saved estimate history for your organization and resets estimate
            numbering cache on this browser.
          </Alert>
          <Button
            variant="outlined"
            color="error"
            onClick={handleResetAllEstimates}
            disabled={resettingEstimates}
          >
            {resettingEstimates ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            Reset all estimates
          </Button>
        </Paper>
      )}

      {/* Change Password Section */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: '16px',
          p: 4,
          background: theme.palette.background.paper,
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 2px 12px rgba(0, 0, 0, 0.35)'
              : '0 2px 12px rgba(0, 0, 0, 0.06)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <LockIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Change Password
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          Your password must be at least 6 characters long. Make sure to choose a strong password.
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label="Current Password"
            type={showPasswords.current ? 'text' : 'password'}
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            fullWidth
            required
            InputProps={{
              endAdornment: (
                <Box
                  component="button"
                  onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                  sx={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {showPasswords.current ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </Box>
              ),
            }}
          />

          <TextField
            label="New Password"
            type={showPasswords.new ? 'text' : 'password'}
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            fullWidth
            required
            helperText="Minimum 6 characters"
            InputProps={{
              endAdornment: (
                <Box
                  component="button"
                  onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                  sx={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {showPasswords.new ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </Box>
              ),
            }}
          />

          <TextField
            label="Confirm New Password"
            type={showPasswords.confirm ? 'text' : 'password'}
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            fullWidth
            required
            error={passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword}
            helperText={
              passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword
                ? 'Passwords do not match'
                : ''
            }
            InputProps={{
              endAdornment: (
                <Box
                  component="button"
                  onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                  sx={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {showPasswords.confirm ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </Box>
              ),
            }}
          />

          <Button
            variant="contained"
            onClick={handlePasswordChange}
            disabled={
              changingPassword ||
              !passwordForm.currentPassword ||
              !passwordForm.newPassword ||
              !passwordForm.confirmPassword ||
              passwordForm.newPassword !== passwordForm.confirmPassword
            }
            sx={{ mt: 1 }}
          >
            {changingPassword ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
            Change Password
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

export default AccountSettingsPage;

