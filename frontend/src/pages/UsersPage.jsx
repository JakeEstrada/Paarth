import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function UsersPage() {
  const { user: currentUser, isAdmin, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [approvingUser, setApprovingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    isActive: true,
  });
  const [approveFormData, setApproveFormData] = useState({
    role: 'employee',
  });

  useEffect(() => {
    if (isAdmin()) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await axios.get(`${API_URL}/users`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setUsers(response.data.users || []);
      setPendingUsers(response.data.pendingUsers || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
        isActive: user.isActive,
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        isActive: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'sales',
      isActive: true,
    });
  };

  const handleApproveUser = (user) => {
    setApprovingUser(user);
    setApproveFormData({ role: 'employee' });
    setApproveDialogOpen(true);
  };

  const handleApproveSubmit = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      await axios.patch(`${API_URL}/users/${approvingUser._id}`, {
        approve: true,
        role: approveFormData.role,
        isActive: true,
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      toast.success('User approved successfully');
      setApproveDialogOpen(false);
      setApprovingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error approving user:', error);
      toast.error(error.response?.data?.error || 'Failed to approve user');
    }
  };

  const handleSubmit = async () => {
    try {
      if (!formData.name || !formData.email) {
        toast.error('Name and email are required');
        return;
      }

      if (!editingUser && !formData.password) {
        toast.error('Password is required for new users');
        return;
      }

      const token = localStorage.getItem('accessToken');
      const payload = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        isActive: formData.isActive,
      };

      if (formData.password) {
        payload.password = formData.password;
      }

      if (editingUser) {
        await axios.patch(`${API_URL}/users/${editingUser._id}`, payload, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        toast.success('User updated successfully');
      } else {
        await axios.post(`${API_URL}/users`, payload, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        toast.success('User created successfully');
      }

      handleCloseDialog();
      fetchUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error(error.response?.data?.error || 'Failed to save user');
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      await axios.delete(`${API_URL}/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(error.response?.data?.error || 'Failed to delete user');
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

  if (!isAdmin()) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" color="error">
          Access Denied
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          You need admin privileges to access this page.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <PersonIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            User Management
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ textTransform: 'none' }}
        >
          Create User
        </Button>
      </Box>

      {/* Pending Users Section */}
      {pendingUsers.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: 'warning.main' }}>
            Pending Approval ({pendingUsers.length})
          </Typography>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#fff3e0' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Registered</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingUsers.map((user) => (
                  <TableRow key={user._id} hover>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<CheckCircleIcon />}
                        onClick={() => handleApproveUser(user)}
                        sx={{ textTransform: 'none', mr: 1 }}
                      >
                        Approve
                      </Button>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(user._id)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Active Users Section */}
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Active Users ({users.length})
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography>Loading...</Typography>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary">No users found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user._id} hover>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.role.replace('_', ' ').toUpperCase()}
                      color={getRoleColor(user.role)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.isActive ? 'Active' : 'Inactive'}
                      color={user.isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(user)}
                      color="primary"
                      title="View/Edit User"
                    >
                      <EditIcon />
                    </IconButton>
                    {user._id !== currentUser?._id && (
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(user._id)}
                        color="error"
                        title="Delete User"
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit User Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">
              {editingUser ? `Edit User: ${editingUser.name}` : 'Create New User'}
            </Typography>
            {editingUser && (
              <Chip
                label={editingUser.role.replace('_', ' ').toUpperCase()}
                color={getRoleColor(editingUser.role)}
                size="small"
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
            {/* User Information Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.secondary' }}>
                User Information
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  fullWidth
                  required
                />
                <TextField
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  fullWidth
                  required
                  disabled={!!editingUser}
                  helperText={editingUser ? "Email cannot be changed" : ""}
                />
                <TextField
                  label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  fullWidth
                  required={!editingUser}
                  helperText={editingUser ? "Leave blank to keep current password. Passwords are securely hashed." : "Minimum 6 characters. Password will be securely hashed."}
                />
              </Box>
            </Box>

            {/* Account Details Section */}
            {editingUser && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.secondary' }}>
                  Account Details
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #e0e0e0' }}>
                    <Typography variant="body2" color="text.secondary">User ID:</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{editingUser._id}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #e0e0e0' }}>
                    <Typography variant="body2" color="text.secondary">Created:</Typography>
                    <Typography variant="body2">
                      {editingUser.createdAt ? new Date(editingUser.createdAt).toLocaleString() : 'N/A'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #e0e0e0' }}>
                    <Typography variant="body2" color="text.secondary">Last Updated:</Typography>
                    <Typography variant="body2">
                      {editingUser.updatedAt ? new Date(editingUser.updatedAt).toLocaleString() : 'N/A'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #e0e0e0' }}>
                    <Typography variant="body2" color="text.secondary">Pending Approval:</Typography>
                    <Chip
                      label={editingUser.isPending ? 'Yes' : 'No'}
                      color={editingUser.isPending ? 'warning' : 'default'}
                      size="small"
                    />
                  </Box>
                </Box>
              </Box>
            )}

            {/* Role & Status Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.secondary' }}>
                Role & Status
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Role</InputLabel>
                  <Select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    label="Role"
                    disabled={!isSuperAdmin() && (formData.role === 'admin' || editingUser?.role === 'admin')}
                  >
                    <MenuItem value="employee">Employee</MenuItem>
                    <MenuItem value="sales">Sales</MenuItem>
                    <MenuItem value="manager">Manager</MenuItem>
                    <MenuItem value="installer">Installer</MenuItem>
                    <MenuItem value="read_only">Read Only</MenuItem>
                    {isSuperAdmin() && <MenuItem value="admin">Admin</MenuItem>}
                    {isSuperAdmin() && <MenuItem value="super_admin">Super Admin</MenuItem>}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                  }
                  label="Active Account"
                />
                {editingUser?.isPending && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={!editingUser.isPending}
                        onChange={async (e) => {
                          try {
                            const token = localStorage.getItem('accessToken');
                            await axios.patch(`${API_URL}/users/${editingUser._id}`, {
                              approve: true,
                            }, {
                              headers: {
                                Authorization: `Bearer ${token}`
                              }
                            });
                            toast.success('User approved');
                            fetchUsers();
                            handleOpenDialog(editingUser); // Refresh dialog
                          } catch (error) {
                            toast.error(error.response?.data?.error || 'Failed to approve user');
                          }
                        }}
                      />
                    }
                    label="Approve User (Remove Pending Status)"
                  />
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingUser ? 'Save Changes' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approve User Dialog */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Approve User: {approvingUser?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Select the role for this user:
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={approveFormData.role}
                onChange={(e) => setApproveFormData({ role: e.target.value })}
                label="Role"
              >
                <MenuItem value="employee">Employee</MenuItem>
                <MenuItem value="sales">Sales</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
                <MenuItem value="installer">Installer</MenuItem>
                <MenuItem value="read_only">Read Only</MenuItem>
                {isSuperAdmin() && <MenuItem value="admin">Admin</MenuItem>}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              Employee: Can change own time, view calendar and pipeline (read-only)
              <br />
              Admin: Can view all employee times, change pipeline
              <br />
              Super Admin: Can create new users
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleApproveSubmit} variant="contained">
            Approve User
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UsersPage;

