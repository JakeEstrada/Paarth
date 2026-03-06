import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Chip,
  CircularProgress,
  Alert,
  TableSortLabel,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
} from '@mui/material';
import {
  Search as SearchIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  Add as AddIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  LocationOn as LocationIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Add as AddCircleIcon,
  Delete as DeleteOutlineIcon,
  Note as NoteIcon,
  Work as WorkIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function CustomersPage() {
  const theme = useTheme();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editCustomerForm, setEditCustomerForm] = useState({});
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesCustomer, setNotesCustomer] = useState(null);
  const [notesText, setNotesText] = useState('');
  const [customerJobs, setCustomerJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Fetch customers
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/customers?limit=1000`);
      setCustomers(response.data.customers || response.data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      // First, fetch existing customers
      await fetchCustomers();
      
      // Then, check if we need to import CSV
      const hasImported = localStorage.getItem('csvImported');
      if (!hasImported) {
        try {
          const response = await axios.post(`${API_URL}/customers/upload-csv`);
          localStorage.setItem('csvImported', 'true');
          
          // Only show success message if customers were actually imported
          if (response.data.imported > 0) {
            toast.success(`Imported ${response.data.imported} customers from CSV`);
            if (response.data.errors > 0) {
              toast.error(`${response.data.errors} rows had errors`);
            }
            // Refresh the customer list after import
            await fetchCustomers();
          } else if (response.data.message) {
            // File not found or other non-error message
            console.log('CSV import:', response.data.message);
            // Don't show toast for file not found - it's expected on first load
          }
        } catch (error) {
          console.error('Error auto-importing CSV:', error);
          // Mark as imported even on failure so we don't keep retrying every load
          localStorage.setItem('csvImported', 'true');
          // Don't show error toast on auto-import failure, just log it
        }
      }
    };
    
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter and sort customers
  const filteredAndSortedCustomers = useMemo(() => {
    let filtered = customers.filter(customer => {
      const searchLower = searchTerm.toLowerCase();
      return (
        customer.name?.toLowerCase().includes(searchLower) ||
        customer.primaryEmail?.toLowerCase().includes(searchLower) ||
        customer.primaryPhone?.includes(searchTerm) ||
        customer.address?.street?.toLowerCase().includes(searchLower) ||
        customer.address?.city?.toLowerCase().includes(searchLower)
      );
    });

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle nested fields
      if (sortField === 'address') {
        aVal = `${a.address?.street || ''} ${a.address?.city || ''}`.trim();
        bVal = `${b.address?.street || ''} ${b.address?.city || ''}`.trim();
      }

      // Handle null/undefined
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      // Compare
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [customers, searchTerm, sortField, sortOrder]);

  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Fetch jobs for a customer
  const fetchCustomerJobs = async (customerId) => {
    if (!customerId) return;
    try {
      setLoadingJobs(true);
      const response = await axios.get(`${API_URL}/jobs`);
      const allJobs = response.data.jobs || response.data || [];
      // Filter jobs for this customer - handle both string and ObjectId comparisons
      const customerIdStr = String(customerId);
      const jobs = allJobs
        .filter(job => {
          const jobCustomerId = job.customerId?._id || job.customerId;
          return String(jobCustomerId) === customerIdStr;
        })
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      setCustomerJobs(jobs);
    } catch (error) {
      console.error('Error fetching customer jobs:', error);
      setCustomerJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  };

  // Open contact modal
  const handleOpenContactModal = (customer) => {
    setSelectedCustomer(customer);
    setIsEditingCustomer(false);
    setEditCustomerForm({});
    setContactModalOpen(true);
    fetchCustomerJobs(customer._id);
  };

  // Start editing customer
  const handleStartEditCustomer = () => {
    if (!selectedCustomer) return;
    setIsEditingCustomer(true);
    
    // Migrate old phones/emails to new structure if needed
    let contactPhones = selectedCustomer.contactPhones ? [...selectedCustomer.contactPhones] : [];
    if (selectedCustomer.primaryPhone && contactPhones.length === 0) {
      contactPhones.push({ label: 'Primary', value: selectedCustomer.primaryPhone });
    }
    if (selectedCustomer.phones && selectedCustomer.phones.length > 0) {
      selectedCustomer.phones.forEach(phone => {
        if (phone && !contactPhones.find(p => p.value === phone)) {
          contactPhones.push({ label: 'Phone', value: phone });
        }
      });
    }
    
    let contactEmails = selectedCustomer.contactEmails ? [...selectedCustomer.contactEmails] : [];
    if (selectedCustomer.primaryEmail && contactEmails.length === 0) {
      contactEmails.push({ label: 'Primary', value: selectedCustomer.primaryEmail });
    }
    if (selectedCustomer.emails && selectedCustomer.emails.length > 0) {
      selectedCustomer.emails.forEach(email => {
        if (email && !contactEmails.find(e => e.value === email)) {
          contactEmails.push({ label: 'Email', value: email });
        }
      });
    }
    
    setEditCustomerForm({
      name: selectedCustomer.name || '',
      primaryPhone: selectedCustomer.primaryPhone || '',
      primaryEmail: selectedCustomer.primaryEmail || '',
      phones: selectedCustomer.phones ? [...selectedCustomer.phones] : [],
      emails: selectedCustomer.emails ? [...selectedCustomer.emails] : [],
      contactPhones: contactPhones,
      contactEmails: contactEmails,
      address: {
        street: selectedCustomer.address?.street || '',
        city: selectedCustomer.address?.city || '',
        state: selectedCustomer.address?.state || '',
        zip: selectedCustomer.address?.zip || '',
      },
      addresses: selectedCustomer.addresses ? [...selectedCustomer.addresses] : [],
      notes: selectedCustomer.notes || '',
      source: selectedCustomer.source || 'other',
      tags: selectedCustomer.tags ? [...selectedCustomer.tags] : [],
    });
  };

  // Cancel editing
  const handleCancelEditCustomer = () => {
    setIsEditingCustomer(false);
    setEditCustomerForm({});
  };

  // Save customer edits
  const handleSaveCustomerEdit = async () => {
    if (!selectedCustomer) return;
    
    try {
      // Prepare update data
      const updateData = {
        name: editCustomerForm.name.trim(),
        primaryPhone: editCustomerForm.primaryPhone || undefined,
        primaryEmail: editCustomerForm.primaryEmail || undefined,
        phones: editCustomerForm.phones || [],
        emails: editCustomerForm.emails || [],
        contactPhones: editCustomerForm.contactPhones?.filter(cp => cp.value?.trim()) || [],
        contactEmails: editCustomerForm.contactEmails?.filter(ce => ce.value?.trim()) || [],
        address: (editCustomerForm.address.street || editCustomerForm.address.city) 
          ? editCustomerForm.address 
          : undefined,
        addresses: editCustomerForm.addresses || [],
        notes: editCustomerForm.notes || undefined,
        source: editCustomerForm.source || 'other',
        tags: editCustomerForm.tags || [],
      };

      await axios.patch(`${API_URL}/customers/${selectedCustomer._id}`, updateData);
      toast.success('Customer updated successfully');
      
      // Refresh customer data
      const updatedResponse = await axios.get(`${API_URL}/customers/${selectedCustomer._id}`);
      setSelectedCustomer(updatedResponse.data);
      setIsEditingCustomer(false);
      setEditCustomerForm({});
      
      // Refresh the customer list
      fetchCustomers();
      // Refresh jobs if customer modal is open
      if (selectedCustomer) {
        fetchCustomerJobs(selectedCustomer._id);
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error(error.response?.data?.error || 'Failed to update customer');
    }
  };

  // Add new phone
  const handleAddPhone = () => {
    setEditCustomerForm(prev => ({
      ...prev,
      contactPhones: [...(prev.contactPhones || []), { label: '', value: '' }]
    }));
  };

  // Remove phone
  const handleRemovePhone = (index) => {
    setEditCustomerForm(prev => ({
      ...prev,
      contactPhones: prev.contactPhones.filter((_, i) => i !== index)
    }));
  };

  // Update phone label
  const handleUpdatePhoneLabel = (index, label) => {
    setEditCustomerForm(prev => ({
      ...prev,
      contactPhones: prev.contactPhones.map((p, i) => i === index ? { ...p, label } : p)
    }));
  };

  // Update phone value
  const handleUpdatePhoneValue = (index, value) => {
    setEditCustomerForm(prev => ({
      ...prev,
      contactPhones: prev.contactPhones.map((p, i) => i === index ? { ...p, value } : p)
    }));
  };

  // Add new email
  const handleAddEmail = () => {
    setEditCustomerForm(prev => ({
      ...prev,
      contactEmails: [...(prev.contactEmails || []), { label: '', value: '' }]
    }));
  };

  // Remove email
  const handleRemoveEmail = (index) => {
    setEditCustomerForm(prev => ({
      ...prev,
      contactEmails: prev.contactEmails.filter((_, i) => i !== index)
    }));
  };

  // Update email label
  const handleUpdateEmailLabel = (index, label) => {
    setEditCustomerForm(prev => ({
      ...prev,
      contactEmails: prev.contactEmails.map((e, i) => i === index ? { ...e, label } : e)
    }));
  };

  // Update email value
  const handleUpdateEmailValue = (index, value) => {
    setEditCustomerForm(prev => ({
      ...prev,
      contactEmails: prev.contactEmails.map((e, i) => i === index ? { ...e, value } : e)
    }));
  };

  // Add new address
  const handleAddAddress = () => {
    setEditCustomerForm(prev => ({
      ...prev,
      addresses: [...(prev.addresses || []), { street: '', city: '', state: '', zip: '', fullAddress: '' }]
    }));
  };

  // Remove address
  const handleRemoveAddress = (index) => {
    setEditCustomerForm(prev => ({
      ...prev,
      addresses: prev.addresses.filter((_, i) => i !== index)
    }));
  };

  // Update address
  const handleUpdateAddress = (index, field, value) => {
    setEditCustomerForm(prev => ({
      ...prev,
      addresses: prev.addresses.map((addr, i) => 
        i === index ? { ...addr, [field]: value } : addr
      )
    }));
  };

  // Add tag
  const handleAddTag = (tag) => {
    if (!tag.trim()) return;
    setEditCustomerForm(prev => ({
      ...prev,
      tags: [...(prev.tags || []), tag.trim()]
    }));
  };

  // Remove tag
  const handleRemoveTag = (index) => {
    setEditCustomerForm(prev => ({
      ...prev,
      tags: prev.tags.filter((_, i) => i !== index)
    }));
  };

  // Handle delete
  const handleDeleteClick = (customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await axios.delete(`${API_URL}/customers/${customerToDelete._id}`);
      toast.success('Customer deleted successfully');
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast.error('Failed to delete customer');
    }
  };

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return '-';
    const parts = [];
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zip) parts.push(address.zip);
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  // Get all phones for a customer (with labels)
  const getAllPhones = (customer) => {
    // Use new structure if available
    if (customer.contactPhones && customer.contactPhones.length > 0) {
      return customer.contactPhones.filter(cp => cp.value);
    }
    // Fallback to old structure
    const phones = [];
    if (customer.primaryPhone) {
      phones.push({ label: 'Primary', value: customer.primaryPhone });
    }
    if (customer.phones && customer.phones.length > 0) {
      customer.phones.forEach(phone => {
        if (phone && !phones.find(p => p.value === phone)) {
          phones.push({ label: 'Phone', value: phone });
        }
      });
    }
    return phones;
  };

  // Get all emails for a customer (with labels)
  const getAllEmails = (customer) => {
    // Use new structure if available
    if (customer.contactEmails && customer.contactEmails.length > 0) {
      return customer.contactEmails.filter(ce => ce.value);
    }
    // Fallback to old structure
    const emails = [];
    if (customer.primaryEmail) {
      emails.push({ label: 'Primary', value: customer.primaryEmail });
    }
    if (customer.emails && customer.emails.length > 0) {
      customer.emails.forEach(email => {
        if (email && !emails.find(e => e.value === email)) {
          emails.push({ label: 'Email', value: email });
        }
      });
    }
    return emails;
  };

  // Get all addresses for a customer
  const getAllAddresses = (customer) => {
    const addresses = [];
    const seenAddresses = new Set();
    
    // Add primary address first if it exists
    if (customer.address && (customer.address.street || customer.address.city)) {
      const primaryStr = formatAddress(customer.address);
      addresses.push({
        address: customer.address,
        display: primaryStr,
        isPrimary: true
      });
      seenAddresses.add(primaryStr.toLowerCase());
    }
    
    // Add addresses from addresses array (avoid duplicates)
    if (customer.addresses && customer.addresses.length > 0) {
      customer.addresses.forEach(addr => {
        const addrStr = addr.fullAddress || formatAddress(addr);
        const normalizedStr = addrStr.toLowerCase();
        if (!seenAddresses.has(normalizedStr)) {
          addresses.push({
            address: addr,
            display: addrStr,
            isPrimary: false
          });
          seenAddresses.add(normalizedStr);
        }
      });
    }
    
    // Sort addresses (primary first, then alphabetically)
    addresses.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.display.localeCompare(b.display);
    });
    
    return addresses;
  };

  // Handle CSV upload
  const handleUploadCSV = async () => {
    try {
      setUploading(true);
      const response = await axios.post(`${API_URL}/customers/upload-csv`);
      toast.success(`Successfully imported ${response.data.imported} customers`);
      if (response.data.errors > 0) {
        toast.error(`${response.data.errors} rows had errors`);
      }
      setUploadDialogOpen(false);
      fetchCustomers();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      toast.error(error.response?.data?.error || 'Failed to upload CSV');
    } finally {
      setUploading(false);
    }
  };

  // Open notes dialog
  const handleOpenNotesDialog = (customer, e) => {
    e.stopPropagation();
    setNotesCustomer(customer);
    setNotesText(customer.notes || '');
    setNotesDialogOpen(true);
  };

  // Save notes
  const handleSaveNotes = async () => {
    if (!notesCustomer) return;
    
    try {
      await axios.patch(`${API_URL}/customers/${notesCustomer._id}`, {
        notes: notesText.trim() || undefined,
      });
      toast.success('Notes updated successfully');
      setNotesDialogOpen(false);
      setNotesCustomer(null);
      setNotesText('');
      fetchCustomers();
    } catch (error) {
      console.error('Error updating notes:', error);
      toast.error('Failed to update notes');
    }
  };

  // Close notes dialog
  const handleCloseNotesDialog = () => {
    setNotesDialogOpen(false);
    setNotesCustomer(null);
    setNotesText('');
  };

  // Truncate notes for display
  const truncateNotes = (notes, maxLength = 50) => {
    if (!notes) return '-';
    if (notes.length <= maxLength) return notes;
    return notes.substring(0, maxLength) + '...';
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'stretch', sm: 'center' },
        mb: { xs: 2, sm: 3 },
        gap: { xs: 2, sm: 0 }
      }}>
        <Typography variant="h4" sx={{ fontWeight: 600, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          Customers
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setUploadDialogOpen(true)}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
          >
            Upload CSV
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
            onClick={async () => {
              try {
                // Create a new customer via API
                const response = await axios.post(`${API_URL}/customers`, {
                  name: 'New Customer',
                  primaryPhone: '',
                  primaryEmail: '',
                  contactPhones: [],
                  contactEmails: [],
                  address: { street: '', city: '', state: '', zip: '' },
                  notes: '',
                  source: 'other',
                });
                const newCustomer = response.data;
                setCustomers([newCustomer, ...customers]);
                setSelectedCustomer(newCustomer);
                handleStartEditCustomer();
                setContactModalOpen(true);
                toast.success('New customer created');
              } catch (error) {
                console.error('Error creating customer:', error);
                toast.error('Failed to create customer');
              }
            }}
          >
            Add Customer
          </Button>
        </Box>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search customers by name, email, phone, or address..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
      />

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer 
          component={Paper} 
          sx={{ 
            borderRadius: '8px',
            overflowX: 'auto',
            maxWidth: '100%',
          }}
        >
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                <TableCell>
                  <TableSortLabel
                    active={sortField === 'name'}
                    direction={sortField === 'name' ? sortOrder : 'asc'}
                    onClick={() => handleSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortField === 'primaryPhone'}
                    direction={sortField === 'primaryPhone' ? sortOrder : 'asc'}
                    onClick={() => handleSort('primaryPhone')}
                  >
                    Phone
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortField === 'primaryEmail'}
                    direction={sortField === 'primaryEmail' ? sortOrder : 'asc'}
                    onClick={() => handleSort('primaryEmail')}
                  >
                    Email
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortField === 'address'}
                    direction={sortField === 'address' ? sortOrder : 'asc'}
                    onClick={() => handleSort('address')}
                  >
                    Address
                  </TableSortLabel>
                </TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAndSortedCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {searchTerm ? 'No customers found matching your search' : 'No customers found'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedCustomers.map((customer) => (
                  <TableRow 
                    key={customer._id} 
                    hover
                    onClick={() => handleOpenContactModal(customer)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{customer.name || '-'}</TableCell>
                    <TableCell>{customer.primaryPhone || '-'}</TableCell>
                    <TableCell>{customer.primaryEmail || '-'}</TableCell>
                    <TableCell>
                      {formatAddress(customer.address)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={customer.source || 'other'}
                        size="small"
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ 
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1
                          }}
                        >
                          {truncateNotes(customer.notes)}
                        </Typography>
                        <Tooltip title={customer.notes ? "Edit notes" : "Add notes"}>
                          <IconButton
                            size="small"
                            onClick={(e) => handleOpenNotesDialog(customer, e)}
                            color={customer.notes ? "primary" : "default"}
                            sx={{ 
                              opacity: customer.notes ? 1 : 0.5,
                              '&:hover': { opacity: 1 }
                            }}
                          >
                            <NoteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteClick(customer)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Customer</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{customerToDelete?.name}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload CSV Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)}>
        <DialogTitle>Upload CSV</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            This will import customers from the <code>Contact_list_processed.CSV</code> file in the backend folder.
            Existing customers with matching email or phone will be updated.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            The CSV should have columns: Name, Phone, Email, Address List
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUploadCSV}
            variant="contained"
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Quick Notes Dialog */}
      <Dialog 
        open={notesDialogOpen} 
        onClose={handleCloseNotesDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NoteIcon color="primary" />
            <span>Notes for {notesCustomer?.name}</span>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={6}
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Add notes about this customer (e.g., gate codes, special instructions, etc.)"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNotesDialog}>Cancel</Button>
          <Button onClick={handleSaveNotes} variant="contained" startIcon={<SaveIcon />}>
            Save Notes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Contact Modal */}
      <Dialog 
        open={contactModalOpen} 
        onClose={() => {
          setContactModalOpen(false);
          setIsEditingCustomer(false);
          setEditCustomerForm({});
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{selectedCustomer?.name || 'Customer Details'}</span>
          {!isEditingCustomer && (
            <IconButton onClick={handleStartEditCustomer} color="primary" size="small">
              <EditIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedCustomer && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
              {isEditingCustomer ? (
                // Edit Mode
                <>
                  {/* Name */}
                  <TextField
                    label="Name"
                    value={editCustomerForm.name || ''}
                    onChange={(e) => setEditCustomerForm({ ...editCustomerForm, name: e.target.value })}
                    fullWidth
                    required
                  />

                  {/* Phone Numbers */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <PhoneIcon color="primary" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Phone Numbers
                      </Typography>
                      <IconButton size="small" onClick={handleAddPhone} color="primary">
                        <AddCircleIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {(editCustomerForm.contactPhones || []).map((phone, idx) => (
                      <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <TextField
                          size="small"
                          value={phone.label || ''}
                          onChange={(e) => handleUpdatePhoneLabel(idx, e.target.value)}
                          placeholder="Label (e.g., John's number, Office)"
                          sx={{ width: '40%' }}
                        />
                        <TextField
                          size="small"
                          value={phone.value || ''}
                          onChange={(e) => handleUpdatePhoneValue(idx, e.target.value)}
                          placeholder="Phone number"
                          fullWidth
                          InputProps={{
                            startAdornment: <PhoneIcon sx={{ mr: 1, color: 'action.active', fontSize: '1rem' }} />,
                          }}
                        />
                        <IconButton size="small" onClick={() => handleRemovePhone(idx)} color="error">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>

                  {/* Email Addresses */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <EmailIcon color="primary" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Email Addresses
                      </Typography>
                      <IconButton size="small" onClick={handleAddEmail} color="primary">
                        <AddCircleIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {(editCustomerForm.contactEmails || []).map((email, idx) => (
                      <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <TextField
                          size="small"
                          value={email.label || ''}
                          onChange={(e) => handleUpdateEmailLabel(idx, e.target.value)}
                          placeholder="Label (e.g., John's email, Office)"
                          sx={{ width: '40%' }}
                        />
                        <TextField
                          size="small"
                          value={email.value || ''}
                          onChange={(e) => handleUpdateEmailValue(idx, e.target.value)}
                          placeholder="Email address"
                          fullWidth
                          type="email"
                          InputProps={{
                            startAdornment: <EmailIcon sx={{ mr: 1, color: 'action.active', fontSize: '1rem' }} />,
                          }}
                        />
                        <IconButton size="small" onClick={() => handleRemoveEmail(idx)} color="error">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>

                  {/* Primary Address */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                      Primary Address
                    </Typography>
                    <TextField
                      label="Street"
                      value={editCustomerForm.address?.street || ''}
                      onChange={(e) => setEditCustomerForm({
                        ...editCustomerForm,
                        address: { ...editCustomerForm.address, street: e.target.value }
                      })}
                      fullWidth
                      sx={{ mb: 1 }}
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        label="City"
                        value={editCustomerForm.address?.city || ''}
                        onChange={(e) => setEditCustomerForm({
                          ...editCustomerForm,
                          address: { ...editCustomerForm.address, city: e.target.value }
                        })}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="State"
                        value={editCustomerForm.address?.state || ''}
                        onChange={(e) => setEditCustomerForm({
                          ...editCustomerForm,
                          address: { ...editCustomerForm.address, state: e.target.value }
                        })}
                        sx={{ width: 100 }}
                      />
                      <TextField
                        label="ZIP"
                        value={editCustomerForm.address?.zip || ''}
                        onChange={(e) => setEditCustomerForm({
                          ...editCustomerForm,
                          address: { ...editCustomerForm.address, zip: e.target.value }
                        })}
                        sx={{ width: 120 }}
                      />
                    </Box>
                  </Box>

                  {/* Additional Addresses */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <LocationIcon color="primary" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Additional Addresses
                      </Typography>
                      <IconButton size="small" onClick={handleAddAddress} color="primary">
                        <AddCircleIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {editCustomerForm.addresses?.map((addr, idx) => (
                      <Box key={idx} sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="caption">Address {idx + 1}</Typography>
                          <IconButton size="small" onClick={() => handleRemoveAddress(idx)} color="error">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Box>
                        <TextField
                          size="small"
                          label="Full Address"
                          value={addr.fullAddress || ''}
                          onChange={(e) => handleUpdateAddress(idx, 'fullAddress', e.target.value)}
                          fullWidth
                          sx={{ mb: 1 }}
                          placeholder="Or enter full address"
                        />
                        <TextField
                          size="small"
                          label="Street"
                          value={addr.street || ''}
                          onChange={(e) => handleUpdateAddress(idx, 'street', e.target.value)}
                          fullWidth
                          sx={{ mb: 1 }}
                        />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField
                            size="small"
                            label="City"
                            value={addr.city || ''}
                            onChange={(e) => handleUpdateAddress(idx, 'city', e.target.value)}
                            sx={{ flex: 1 }}
                          />
                          <TextField
                            size="small"
                            label="State"
                            value={addr.state || ''}
                            onChange={(e) => handleUpdateAddress(idx, 'state', e.target.value)}
                            sx={{ width: 100 }}
                          />
                          <TextField
                            size="small"
                            label="ZIP"
                            value={addr.zip || ''}
                            onChange={(e) => handleUpdateAddress(idx, 'zip', e.target.value)}
                            sx={{ width: 120 }}
                          />
                        </Box>
                      </Box>
                    ))}
                  </Box>

                  {/* Source */}
                  <FormControl fullWidth>
                    <InputLabel>Source</InputLabel>
                    <Select
                      value={editCustomerForm.source || 'other'}
                      onChange={(e) => setEditCustomerForm({ ...editCustomerForm, source: e.target.value })}
                      label="Source"
                    >
                      <MenuItem value="referral">Referral</MenuItem>
                      <MenuItem value="yelp">Yelp</MenuItem>
                      <MenuItem value="instagram">Instagram</MenuItem>
                      <MenuItem value="facebook">Facebook</MenuItem>
                      <MenuItem value="website">Website</MenuItem>
                      <MenuItem value="repeat">Repeat</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  </FormControl>

                  {/* Notes */}
                  <TextField
                    label="Notes"
                    value={editCustomerForm.notes || ''}
                    onChange={(e) => setEditCustomerForm({ ...editCustomerForm, notes: e.target.value })}
                    fullWidth
                    multiline
                    rows={3}
                  />

                  {/* Tags */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                      Tags
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                      {editCustomerForm.tags?.map((tag, idx) => (
                        <Chip
                          key={idx}
                          label={tag}
                          size="small"
                          onDelete={() => handleRemoveTag(idx)}
                        />
                      ))}
                    </Box>
                    <TextField
                      size="small"
                      placeholder="Add tag and press Enter"
                      fullWidth
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddTag(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    />
                  </Box>
                </>
              ) : (
                // View Mode
                <>
                  {/* Phone Numbers */}
                  {getAllPhones(selectedCustomer).length > 0 && (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <PhoneIcon color="primary" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Phone Numbers ({getAllPhones(selectedCustomer).length})
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 4 }}>
                        {getAllPhones(selectedCustomer).map((phone, idx) => (
                          <Box 
                            key={idx}
                            sx={{
                              pl: 2,
                              borderLeft: '3px solid #e0e0e0',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1
                            }}
                          >
                            <Typography 
                              variant="body2"
                              sx={{
                                fontWeight: phone.label ? 600 : 400,
                                color: phone.label ? 'text.primary' : 'text.secondary',
                                minWidth: '100px'
                              }}
                            >
                              {phone.label || 'Phone'}:
                            </Typography>
                            <Typography 
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.9rem',
                                flex: 1
                              }}
                            >
                              {phone.value}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Email Addresses */}
                  {getAllEmails(selectedCustomer).length > 0 && (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <EmailIcon color="primary" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Email Addresses ({getAllEmails(selectedCustomer).length})
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 4 }}>
                        {getAllEmails(selectedCustomer).map((email, idx) => (
                          <Box 
                            key={idx}
                            sx={{
                              pl: 2,
                              borderLeft: '3px solid #e0e0e0',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1
                            }}
                          >
                            <Typography 
                              variant="body2"
                              sx={{
                                fontWeight: email.label ? 600 : 400,
                                color: email.label ? 'text.primary' : 'text.secondary',
                                minWidth: '100px'
                              }}
                            >
                              {email.label || 'Email'}:
                            </Typography>
                            <Typography 
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.9rem',
                                flex: 1
                              }}
                            >
                              {email.value}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Addresses */}
                  {getAllAddresses(selectedCustomer).length > 0 && (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <LocationIcon color="primary" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Addresses ({getAllAddresses(selectedCustomer).length})
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 4 }}>
                        {getAllAddresses(selectedCustomer).map((addrObj, idx) => (
                          <Typography 
                            key={idx}
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.9rem',
                              pl: 2,
                              borderLeft: addrObj.isPrimary 
                                ? '3px solid #1976D2' 
                                : '3px solid #e0e0e0'
                            }}
                          >
                            {addrObj.display}
                            {addrObj.isPrimary && (
                              <Chip label="Primary" size="small" sx={{ ml: 1, height: 20 }} />
                            )}
                          </Typography>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Source */}
                  {selectedCustomer.source && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                        Source:
                      </Typography>
                      <Chip
                        label={selectedCustomer.source}
                        size="small"
                        sx={{ textTransform: 'capitalize', ml: 2 }}
                      />
                    </Box>
                  )}

                  {/* Notes */}
                  {selectedCustomer.notes && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                        Notes:
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
                        {selectedCustomer.notes}
                      </Typography>
                    </Box>
                  )}

                  {/* Tags */}
                  {selectedCustomer.tags && selectedCustomer.tags.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                        Tags:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 2 }}>
                        {selectedCustomer.tags.map((tag, idx) => (
                          <Chip key={idx} label={tag} size="small" />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Jobs */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <WorkIcon color="primary" />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Jobs ({customerJobs.length})
                      </Typography>
                    </Box>
                    {loadingJobs ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={24} />
                      </Box>
                    ) : customerJobs.length > 0 ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 4 }}>
                        {customerJobs.map((job) => (
                          <Box
                            key={job._id}
                            sx={{
                              p: 1.5,
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:hover': {
                                backgroundColor: 'action.hover',
                                cursor: 'pointer',
                              },
                            }}
                            onClick={() => {
                              // Navigate to pipeline page
                              window.location.href = '/pipeline';
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                                  {job.title}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                                  <Chip
                                    label={job.stage?.replace(/_/g, ' ') || 'Unknown'}
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                  />
                                  {(job.valueEstimated || job.valueContracted) && (
                                    <Typography variant="caption" color="text.secondary">
                                      ${((job.valueContracted || job.valueEstimated) / 1000).toFixed(0)}K
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                              <OpenInNewIcon sx={{ fontSize: 16, color: 'text.secondary', ml: 1 }} />
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ pl: 4, fontStyle: 'italic' }}>
                        No jobs found for this customer
                      </Typography>
                    )}
                  </Box>

                  {/* Show message if no contact info */}
                  {getAllPhones(selectedCustomer).length === 0 && 
                   getAllEmails(selectedCustomer).length === 0 && 
                   getAllAddresses(selectedCustomer).length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                      No contact information available
                    </Typography>
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {isEditingCustomer ? (
            <>
              <Button onClick={handleCancelEditCustomer}>Cancel</Button>
              <Button onClick={handleSaveCustomerEdit} variant="contained" startIcon={<SaveIcon />}>
                Save
              </Button>
            </>
          ) : (
            <Button onClick={() => setContactModalOpen(false)}>Close</Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CustomersPage;

