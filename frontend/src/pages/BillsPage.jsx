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
  Link,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function BillsPage() {
  const theme = useTheme();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDay: '',
    billUrl: '',
    vendor: '',
    category: 'other',
  });

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await axios.get(`${API_URL}/bills`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setBills(response.data.bills || []);
    } catch (error) {
      console.error('Error fetching bills:', error);
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (bill = null) => {
    if (bill) {
      setEditingBill(bill);
      setFormData({
        title: bill.title || '',
        description: bill.description || '',
        dueDay: bill.dueDay || '',
        billUrl: bill.billUrl || '',
        vendor: bill.vendor || '',
        category: bill.category || 'other',
      });
    } else {
      setEditingBill(null);
      setFormData({
        title: '',
        description: '',
        dueDay: '',
        billUrl: '',
        vendor: '',
        category: 'other',
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingBill(null);
    setFormData({
      title: '',
      description: '',
      dueDay: '',
      billUrl: '',
      vendor: '',
      category: 'other',
    });
  };

  const handleSubmit = async () => {
    try {
      if (!formData.title || !formData.dueDay) {
        toast.error('Title and due day are required');
        return;
      }

      if (formData.dueDay < 1 || formData.dueDay > 31) {
        toast.error('Due day must be between 1 and 31');
        return;
      }

      const token = localStorage.getItem('accessToken');
      const payload = {
        ...formData,
        dueDay: parseInt(formData.dueDay),
      };

      if (editingBill) {
        await axios.patch(`${API_URL}/bills/${editingBill._id}`, payload, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        toast.success('Bill updated successfully');
      } else {
        await axios.post(`${API_URL}/bills`, payload, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        toast.success('Bill created successfully');
      }

      handleCloseDialog();
      fetchBills();
    } catch (error) {
      console.error('Error saving bill:', error);
      toast.error(error.response?.data?.error || 'Failed to save bill');
    }
  };

  const handleDelete = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this bill?')) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      await axios.delete(`${API_URL}/bills/${billId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      toast.success('Bill deleted successfully');
      fetchBills();
    } catch (error) {
      console.error('Error deleting bill:', error);
      toast.error(error.response?.data?.error || 'Failed to delete bill');
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      utilities: 'primary',
      rent: 'warning',
      supplies: 'info',
      equipment: 'success',
      insurance: 'secondary',
      taxes: 'error',
      software: 'info',
      other: 'default',
    };
    return colors[category] || 'default';
  };

  // Sort bills by due day (1-31)
  const sortedBills = [...bills].sort((a, b) => a.dueDay - b.dueDay);

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ReceiptIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Bills
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ textTransform: 'none' }}
        >
          Add Bill
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Due Day</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Link</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography>Loading...</Typography>
                </TableCell>
              </TableRow>
            ) : sortedBills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.secondary">No bills found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedBills.map((bill) => (
                <TableRow key={bill._id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {bill.title}
                    </Typography>
                  </TableCell>
                  <TableCell>{bill.vendor || '-'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Day {bill.dueDay}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={bill.category.charAt(0).toUpperCase() + bill.category.slice(1)}
                      color={getCategoryColor(bill.category)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {bill.billUrl ? (
                      <Link
                        href={bill.billUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <LinkIcon fontSize="small" />
                        <Typography variant="caption">View</Typography>
                      </Link>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>
                      {bill.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(bill)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(bill._id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Bill Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingBill ? 'Edit Bill' : 'Add New Bill'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              label="Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Vendor"
              value={formData.vendor}
              onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
              fullWidth
              placeholder="e.g., Verizon, Intuit, Cox"
            />
            <TextField
              label="Due Day"
              type="number"
              value={formData.dueDay}
              onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })}
              fullWidth
              required
              inputProps={{ min: 1, max: 31 }}
              helperText="Day of the month (1-31) when the bill is due"
            />
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                label="Category"
              >
                <MenuItem value="utilities">Utilities</MenuItem>
                <MenuItem value="rent">Rent</MenuItem>
                <MenuItem value="supplies">Supplies</MenuItem>
                <MenuItem value="equipment">Equipment</MenuItem>
                <MenuItem value="insurance">Insurance</MenuItem>
                <MenuItem value="taxes">Taxes</MenuItem>
                <MenuItem value="software">Software</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Bill URL"
              value={formData.billUrl}
              onChange={(e) => setFormData({ ...formData, billUrl: e.target.value })}
              fullWidth
              placeholder="https://..."
              helperText="Link to the bill page or document"
            />
            <TextField
              label="Notes"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
              helperText="Additional notes about this bill"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingBill ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default BillsPage;

