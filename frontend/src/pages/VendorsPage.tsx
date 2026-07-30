/**
 * VendorsPage — Vendor directory (contact cards, no job tracking).
 * Route: /vendors
 */
// @ts-nocheck
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
  TableSortLabel,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  DialogContentText,
} from '@mui/material';
import {
  Search as SearchIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  LocationOn as LocationIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Add as AddCircleIcon,
  Delete as DeleteOutlineIcon,
  Share as ShareIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import EmployeeSmsRecipientField, {
  parseSmsRecipientSelection,
} from '../components/common/EmployeeSmsRecipientField';
import PhoneTextField from '../components/common/PhoneTextField';
import { formatNanpTyping, formatPhoneForDisplay, phoneSearchMatch } from '../utils/phoneFormat';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const VENDOR_CATEGORIES = [
  { value: 'lumber', label: 'Lumber' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'other', label: 'Other' },
];

function formatAddress(address) {
  if (!address) return '-';
  const parts = [];
  if (address.street) parts.push(address.street);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.zip) parts.push(address.zip);
  return parts.length > 0 ? parts.join(', ') : '-';
}

function getAllPhones(vendor) {
  if (vendor.contactPhones?.length > 0) {
    return vendor.contactPhones.filter((cp) => cp.value);
  }
  const phones = [];
  if (vendor.primaryPhone) phones.push({ label: 'Primary', value: vendor.primaryPhone });
  (vendor.phones || []).forEach((phone) => {
    if (phone && !phones.find((p) => p.value === phone)) {
      phones.push({ label: 'Phone', value: phone });
    }
  });
  return phones;
}

function getAllEmails(vendor) {
  if (vendor.contactEmails?.length > 0) {
    return vendor.contactEmails.filter((ce) => ce.value);
  }
  const emails = [];
  if (vendor.primaryEmail) emails.push({ label: 'Primary', value: vendor.primaryEmail });
  (vendor.emails || []).forEach((email) => {
    if (email && !emails.find((e) => e.value === email)) {
      emails.push({ label: 'Email', value: email });
    }
  });
  return emails;
}

function getPrimaryContactPhone(contactPhones = []) {
  const phones = contactPhones.filter((cp) => cp?.value?.trim());
  const labeledPrimary = phones.find((cp) => /^primary$/i.test(String(cp.label || '').trim()));
  return (labeledPrimary || phones[0])?.value?.trim() || '';
}

function getPrimaryContactEmail(contactEmails = []) {
  const emails = contactEmails.filter((ce) => ce?.value?.trim());
  const labeledPrimary = emails.find((ce) => /^primary$/i.test(String(ce.label || '').trim()));
  return (labeledPrimary || emails[0])?.value?.trim() || '';
}

function getDisplayPhone(vendor) {
  return getAllPhones(vendor)[0]?.value || vendor.primaryPhone || '';
}

function getDisplayEmail(vendor) {
  return getAllEmails(vendor)[0]?.value || vendor.primaryEmail || '';
}

function getAllAddresses(vendor) {
  const addresses = [];
  const seen = new Set();

  if (vendor.address && (vendor.address.street || vendor.address.city)) {
    const display = formatAddress(vendor.address);
    addresses.push({ display, isPrimary: true });
    seen.add(display.toLowerCase());
  }

  (vendor.addresses || []).forEach((addr) => {
    const display = addr.fullAddress || formatAddress(addr);
    const key = display.toLowerCase();
    if (display && display !== '-' && !seen.has(key)) {
      addresses.push({ display, isPrimary: false });
      seen.add(key);
    }
  });

  return addresses;
}

function formatCategoryLabel(category) {
  return VENDOR_CATEGORIES.find((c) => c.value === category)?.label || category || 'Other';
}

function truncateNotes(notes, maxLength = 50) {
  if (!notes) return '-';
  if (notes.length <= maxLength) return notes;
  return `${notes.substring(0, maxLength)}...`;
}

export default function VendorsPage() {
  const theme = useTheme();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareSmsRecipient, setShareSmsRecipient] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [sendingShare, setSendingShare] = useState(false);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/vendors?limit=1000`);
      setVendors(response.data.vendors || response.data || []);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const filteredAndSortedVendors = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    let filtered = vendors.filter((vendor) => (
      vendor.name?.toLowerCase().includes(searchLower) ||
      vendor.primaryEmail?.toLowerCase().includes(searchLower) ||
      phoneSearchMatch(vendor.primaryPhone, searchTerm) ||
      (Array.isArray(vendor.contactPhones) &&
        vendor.contactPhones.some((cp) => phoneSearchMatch(cp?.value, searchTerm))) ||
      vendor.address?.street?.toLowerCase().includes(searchLower) ||
      vendor.address?.city?.toLowerCase().includes(searchLower) ||
      formatCategoryLabel(vendor.category).toLowerCase().includes(searchLower)
    ));

    filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'address') {
        aVal = `${a.address?.street || ''} ${a.address?.city || ''}`.trim();
        bVal = `${b.address?.street || ''} ${b.address?.city || ''}`.trim();
      }

      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [vendors, searchTerm, sortField, sortOrder]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleOpenContactModal = (vendor) => {
    setSelectedVendor(vendor);
    setIsEditing(false);
    setEditForm({});
    setContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    setContactModalOpen(false);
    setIsEditing(false);
    setEditForm({});
  };

  const buildShareMessage = (vendor) => {
    if (!vendor) return '';
    const phones = getAllPhones(vendor).map((p) => p.value).filter(Boolean);
    const emails = getAllEmails(vendor).map((e) => e.value).filter(Boolean);
    const addr = formatAddress(vendor.address);
    const lines = [
      `Vendor: ${vendor.name || 'Unknown'}`,
      phones.length ? `Phone: ${phones.map((p) => formatPhoneForDisplay(p)).join(', ')}` : null,
      emails.length ? `Email: ${emails.join(', ')}` : null,
      addr && addr !== '-' ? `Address: ${addr}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  };

  const handleOpenShareDialog = () => {
    if (!selectedVendor) return;
    setShareSmsRecipient('');
    setShareMessage(buildShareMessage(selectedVendor));
    setShareDialogOpen(true);
  };

  const handleCloseShareDialog = () => {
    setShareDialogOpen(false);
    setShareSmsRecipient('');
    setShareMessage('');
    setSendingShare(false);
  };

  const handleSendShareSms = async () => {
    const message = shareMessage.trim();
    if (!shareSmsRecipient) {
      toast.error('Enter a phone number or select a recipient');
      return;
    }
    if (!message) {
      toast.error('Message cannot be empty');
      return;
    }
    try {
      setSendingShare(true);
      await axios.post(`${API_URL}/twilio/send-sms`, {
        ...parseSmsRecipientSelection(shareSmsRecipient),
        message,
      });
      toast.success('Vendor info sent by text');
      handleCloseShareDialog();
    } catch (error) {
      console.error('Error sending vendor share text:', error);
      toast.error(error.response?.data?.error || 'Failed to send text');
    } finally {
      setSendingShare(false);
    }
  };

  const handleStartEdit = () => {
    if (!selectedVendor) return;
    setIsEditing(true);

    let contactPhones = selectedVendor.contactPhones ? [...selectedVendor.contactPhones] : [];
    if (selectedVendor.primaryPhone && contactPhones.length === 0) {
      contactPhones.push({ label: 'Primary', value: selectedVendor.primaryPhone });
    }

    let contactEmails = selectedVendor.contactEmails ? [...selectedVendor.contactEmails] : [];
    if (selectedVendor.primaryEmail && contactEmails.length === 0) {
      contactEmails.push({ label: 'Primary', value: selectedVendor.primaryEmail });
    }

    setEditForm({
      name: selectedVendor.name || '',
      contactPhones: contactPhones.map((cp) => ({
        ...cp,
        value: cp.value ? formatNanpTyping(cp.value) : '',
      })),
      contactEmails,
      address: {
        street: selectedVendor.address?.street || '',
        city: selectedVendor.address?.city || '',
        state: selectedVendor.address?.state || '',
        zip: selectedVendor.address?.zip || '',
      },
      addresses: selectedVendor.addresses ? [...selectedVendor.addresses] : [],
      notes: selectedVendor.notes || '',
      category: selectedVendor.category || 'other',
      tags: selectedVendor.tags ? [...selectedVendor.tags] : [],
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedVendor) return;

    try {
      const contactPhones = editForm.contactPhones?.filter((cp) => cp.value?.trim()) || [];
      const contactEmails = editForm.contactEmails?.filter((ce) => ce.value?.trim()) || [];

      const updateData = {
        name: editForm.name.trim(),
        primaryPhone: getPrimaryContactPhone(contactPhones) || undefined,
        primaryEmail: getPrimaryContactEmail(contactEmails) || undefined,
        contactPhones,
        contactEmails,
        address: (editForm.address?.street || editForm.address?.city)
          ? editForm.address
          : undefined,
        addresses: editForm.addresses || [],
        notes: editForm.notes || undefined,
        category: editForm.category || 'other',
        tags: editForm.tags || [],
      };

      await axios.patch(`${API_URL}/vendors/${selectedVendor._id}`, updateData);
      toast.success('Vendor updated');

      const updatedResponse = await axios.get(`${API_URL}/vendors/${selectedVendor._id}`);
      const updatedVendor = updatedResponse.data;
      setSelectedVendor(updatedVendor);
      setVendors((prev) =>
        prev.map((vendor) =>
          String(vendor._id) === String(updatedVendor._id) ? { ...vendor, ...updatedVendor } : vendor,
        ),
      );
      setIsEditing(false);
      setEditForm({});
      await fetchVendors();
    } catch (error) {
      console.error('Error updating vendor:', error);
      toast.error(error.response?.data?.error || 'Failed to update vendor');
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await axios.delete(`${API_URL}/vendors/${vendorToDelete._id}`);
      toast.success('Vendor deleted');
      setDeleteDialogOpen(false);
      if (selectedVendor?._id === vendorToDelete?._id) {
        handleCloseContactModal();
        setSelectedVendor(null);
      }
      setVendorToDelete(null);
      fetchVendors();
    } catch (error) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor');
    }
  };

  const handleAddVendor = async () => {
    try {
      const response = await axios.post(`${API_URL}/vendors`, {
        name: 'New Vendor',
        primaryPhone: '',
        primaryEmail: '',
        contactPhones: [],
        contactEmails: [],
        address: { street: '', city: '', state: '', zip: '' },
        notes: '',
        category: 'other',
      });
      const newVendor = response.data;
      setVendors([newVendor, ...vendors]);
      setSelectedVendor(newVendor);
      setIsEditing(true);
      setEditForm({
        name: newVendor.name || '',
        contactPhones: [],
        contactEmails: [],
        address: { street: '', city: '', state: '', zip: '' },
        addresses: [],
        notes: '',
        category: newVendor.category || 'other',
        tags: [],
      });
      setContactModalOpen(true);
      toast.success('New vendor created');
    } catch (error) {
      console.error('Error creating vendor:', error);
      toast.error('Failed to create vendor');
    }
  };

  const contactModalAddressList = useMemo(() => {
    if (!selectedVendor) return [];
    return getAllAddresses(selectedVendor);
  }, [selectedVendor]);

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          mb: { xs: 2, sm: 3 },
          gap: { xs: 2, sm: 0 },
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 600, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          Vendors
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ borderRadius: '8px', textTransform: 'none' }}
          onClick={handleAddVendor}
        >
          Add Vendor
        </Button>
      </Box>

      <TextField
        fullWidth
        placeholder="Search vendors by name, email, phone, address, or category..."
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

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          sx={{ borderRadius: '8px', overflowX: 'auto', maxWidth: '100%' }}
        >
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                <TableCell>
                  <TableSortLabel active={sortField === 'name'} direction={sortField === 'name' ? sortOrder : 'asc'} onClick={() => handleSort('name')}>
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'primaryPhone'} direction={sortField === 'primaryPhone' ? sortOrder : 'asc'} onClick={() => handleSort('primaryPhone')}>
                    Phone
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'primaryEmail'} direction={sortField === 'primaryEmail' ? sortOrder : 'asc'} onClick={() => handleSort('primaryEmail')}>
                    Email
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'address'} direction={sortField === 'address' ? sortOrder : 'asc'} onClick={() => handleSort('address')}>
                    Address
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'category'} direction={sortField === 'category' ? sortOrder : 'asc'} onClick={() => handleSort('category')}>
                    Category
                  </TableSortLabel>
                </TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAndSortedVendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {searchTerm ? 'No vendors found matching your search' : 'No vendors yet — add your first vendor'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedVendors.map((vendor) => (
                  <TableRow
                    key={vendor._id}
                    hover
                    onClick={() => handleOpenContactModal(vendor)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{vendor.name || '-'}</TableCell>
                    <TableCell>{formatPhoneForDisplay(getDisplayPhone(vendor)) || '-'}</TableCell>
                    <TableCell>{getDisplayEmail(vendor) || '-'}</TableCell>
                    <TableCell>{formatAddress(vendor.address)}</TableCell>
                    <TableCell>
                      <Chip label={formatCategoryLabel(vendor.category)} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {truncateNotes(vendor.notes)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Vendor</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{vendorToDelete?.name}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={contactModalOpen} onClose={handleCloseContactModal} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{selectedVendor?.name || 'Vendor Details'}</span>
          {!isEditing && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Share via text">
                <IconButton onClick={handleOpenShareDialog} color="primary" size="small">
                  <ShareIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit vendor">
                <IconButton onClick={handleStartEdit} color="primary" size="small">
                  <EditIcon />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedVendor && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
              {isEditing ? (
                <>
                  <TextField
                    label="Name"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    fullWidth
                    required
                  />

                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <PhoneIcon color="primary" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Phone Numbers</Typography>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => setEditForm((prev) => ({
                          ...prev,
                          contactPhones: [...(prev.contactPhones || []), { label: '', value: '' }],
                        }))}
                      >
                        <AddCircleIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {(editForm.contactPhones || []).map((phone, idx) => (
                      <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <TextField
                          size="small"
                          value={phone.label || ''}
                          onChange={(e) => setEditForm((prev) => ({
                            ...prev,
                            contactPhones: prev.contactPhones.map((p, i) => i === idx ? { ...p, label: e.target.value } : p),
                          }))}
                          placeholder="Label"
                          sx={{ width: '40%' }}
                        />
                        <PhoneTextField
                          size="small"
                          value={phone.value || ''}
                          onChange={(e) => setEditForm((prev) => ({
                            ...prev,
                            contactPhones: prev.contactPhones.map((p, i) =>
                              i === idx ? { ...p, value: formatNanpTyping(e.target.value) } : p,
                            ),
                          }))}
                          fullWidth
                        />
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setEditForm((prev) => ({
                            ...prev,
                            contactPhones: prev.contactPhones.filter((_, i) => i !== idx),
                          }))}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <EmailIcon color="primary" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Email Addresses</Typography>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => setEditForm((prev) => ({
                          ...prev,
                          contactEmails: [...(prev.contactEmails || []), { label: '', value: '' }],
                        }))}
                      >
                        <AddCircleIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {(editForm.contactEmails || []).map((email, idx) => (
                      <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <TextField
                          size="small"
                          value={email.label || ''}
                          onChange={(e) => setEditForm((prev) => ({
                            ...prev,
                            contactEmails: prev.contactEmails.map((item, i) => i === idx ? { ...item, label: e.target.value } : item),
                          }))}
                          placeholder="Label"
                          sx={{ width: '40%' }}
                        />
                        <TextField
                          size="small"
                          value={email.value || ''}
                          onChange={(e) => setEditForm((prev) => ({
                            ...prev,
                            contactEmails: prev.contactEmails.map((item, i) => i === idx ? { ...item, value: e.target.value } : item),
                          }))}
                          fullWidth
                          type="email"
                        />
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setEditForm((prev) => ({
                            ...prev,
                            contactEmails: prev.contactEmails.filter((_, i) => i !== idx),
                          }))}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Primary Address</Typography>
                    <TextField
                      label="Street"
                      value={editForm.address?.street || ''}
                      onChange={(e) => setEditForm({
                        ...editForm,
                        address: { ...editForm.address, street: e.target.value },
                      })}
                      fullWidth
                      sx={{ mb: 1 }}
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        label="City"
                        value={editForm.address?.city || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          address: { ...editForm.address, city: e.target.value },
                        })}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="State"
                        value={editForm.address?.state || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          address: { ...editForm.address, state: e.target.value },
                        })}
                        sx={{ width: 100 }}
                      />
                      <TextField
                        label="ZIP"
                        value={editForm.address?.zip || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          address: { ...editForm.address, zip: e.target.value },
                        })}
                        sx={{ width: 120 }}
                      />
                    </Box>
                  </Box>

                  <FormControl fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={editForm.category || 'other'}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      label="Category"
                    >
                      {VENDOR_CATEGORIES.map((option) => (
                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    label="Notes"
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    fullWidth
                    multiline
                    rows={3}
                  />

                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Tags</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                      {(editForm.tags || []).map((tag, idx) => (
                        <Chip
                          key={idx}
                          label={tag}
                          size="small"
                          onDelete={() => setEditForm((prev) => ({
                            ...prev,
                            tags: prev.tags.filter((_, i) => i !== idx),
                          }))}
                        />
                      ))}
                    </Box>
                    <TextField
                      size="small"
                      placeholder="Add tag and press Enter"
                      fullWidth
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          setEditForm((prev) => ({
                            ...prev,
                            tags: [...(prev.tags || []), e.target.value.trim()],
                          }));
                          e.target.value = '';
                        }
                      }}
                    />
                  </Box>
                </>
              ) : (
                <>
                  {getAllPhones(selectedVendor).length > 0 && (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <PhoneIcon color="primary" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Phone Numbers ({getAllPhones(selectedVendor).length})
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 4 }}>
                        {getAllPhones(selectedVendor).map((phone, idx) => (
                          <Typography key={idx} variant="body2" sx={{ pl: 2, borderLeft: '3px solid #e0e0e0' }}>
                            <strong>{phone.label || 'Phone'}:</strong> {formatPhoneForDisplay(phone.value)}
                          </Typography>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {getAllEmails(selectedVendor).length > 0 && (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <EmailIcon color="primary" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Email Addresses ({getAllEmails(selectedVendor).length})
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 4 }}>
                        {getAllEmails(selectedVendor).map((email, idx) => (
                          <Typography key={idx} variant="body2" sx={{ pl: 2, borderLeft: '3px solid #e0e0e0' }}>
                            <strong>{email.label || 'Email'}:</strong> {email.value}
                          </Typography>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {contactModalAddressList.length > 0 && (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <LocationIcon color="primary" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Addresses ({contactModalAddressList.length})
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 4 }}>
                        {contactModalAddressList.map((addrObj, idx) => (
                          <Typography
                            key={`addr-${idx}`}
                            variant="body2"
                            sx={{
                              pl: 2,
                              borderLeft: addrObj.isPrimary
                                ? `3px solid ${theme.palette.primary.main}`
                                : `3px solid ${theme.palette.divider}`,
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

                  {selectedVendor.category && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Category:</Typography>
                      <Chip label={formatCategoryLabel(selectedVendor.category)} size="small" sx={{ ml: 2 }} />
                    </Box>
                  )}

                  {selectedVendor.notes && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Notes:</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
                        {selectedVendor.notes}
                      </Typography>
                    </Box>
                  )}

                  {selectedVendor.tags?.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Tags:</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 2 }}>
                        {selectedVendor.tags.map((tag, idx) => (
                          <Chip key={idx} label={tag} size="small" />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {getAllPhones(selectedVendor).length === 0 &&
                    getAllEmails(selectedVendor).length === 0 &&
                    contactModalAddressList.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                        No contact information yet — click Edit to add details
                      </Typography>
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={isEditing ? { justifyContent: 'space-between', px: 3, pb: 2 } : undefined}>
          {isEditing ? (
            <>
              <Button
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => {
                  setVendorToDelete(selectedVendor);
                  setDeleteDialogOpen(true);
                }}
              >
                Delete
              </Button>
              <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                <Button onClick={() => { setIsEditing(false); setEditForm({}); }}>Cancel</Button>
                <Button onClick={handleSaveEdit} variant="contained" startIcon={<SaveIcon />}>
                  Save
                </Button>
              </Box>
            </>
          ) : (
            <Button onClick={handleCloseContactModal}>Close</Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={shareDialogOpen} onClose={handleCloseShareDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Share Vendor by Text</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Search for an employee or type any phone number to send the text to.
          </DialogContentText>
          <EmployeeSmsRecipientField
            dialogOpen={shareDialogOpen}
            value={shareSmsRecipient}
            onChange={setShareSmsRecipient}
            disabled={sendingShare}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Message"
            value={shareMessage}
            onChange={(e) => setShareMessage(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseShareDialog} disabled={sendingShare}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSendShareSms}
            disabled={sendingShare}
            startIcon={sendingShare ? <CircularProgress size={16} /> : <ShareIcon />}
          >
            {sendingShare ? 'Sending...' : 'Send Text'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
