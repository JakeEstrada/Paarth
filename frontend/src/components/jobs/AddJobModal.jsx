import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  CircularProgress,
} from '@mui/material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const SOURCE_OPTIONS = [
  { value: 'referral', label: 'Referral' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'website', label: 'Website' },
  { value: 'repeat', label: 'Repeat Customer' },
  { value: 'other', label: 'Other' },
];

function AddJobModal({ open, onClose, onJobCreated }) {
  const [formData, setFormData] = useState({
    title: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: {
      street: '',
      city: '',
      state: '',
      zip: '',
    },
    valueEstimated: '',
    source: 'other',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      // Reset form when modal opens
      setFormData({
        title: '',
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerAddress: {
          street: '',
          city: '',
          state: '',
          zip: '',
        },
        valueEstimated: '',
        source: 'other',
      });
      setErrors({});
    }
  }, [open]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleAddressChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      customerAddress: {
        ...prev.customerAddress,
        [field]: value,
      },
    }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) {
      newErrors.title = 'Job title is required';
    }
    if (!formData.customerName.trim()) {
      newErrors.customerName = 'Customer name is required';
    }
    if (formData.valueEstimated && isNaN(formData.valueEstimated)) {
      newErrors.valueEstimated = 'Estimated value must be a number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    try {
      setSaving(true);
      
      // First, find or create the customer
      let customerId;
      const customerName = formData.customerName.trim();
      
      try {
        // Try to find existing customer by name
        const customersResponse = await axios.get(`${API_URL}/customers`);
        const customers = customersResponse.data.customers || customersResponse.data || [];
        const existingCustomer = customers.find(
          (c) => c.name.toLowerCase() === customerName.toLowerCase()
        );
        
        if (existingCustomer) {
          customerId = existingCustomer._id;
          // Update existing customer with any new information provided
          const updateData = {};
          if (formData.customerPhone && !existingCustomer.primaryPhone) {
            updateData.primaryPhone = formData.customerPhone;
          }
          if (formData.customerEmail && !existingCustomer.primaryEmail) {
            updateData.primaryEmail = formData.customerEmail;
          }
          if ((formData.customerAddress.street || formData.customerAddress.city) && 
              (!existingCustomer.address?.street && !existingCustomer.address?.city)) {
            updateData.address = formData.customerAddress;
          }
          if (Object.keys(updateData).length > 0) {
            await axios.patch(`${API_URL}/customers/${customerId}`, updateData);
            toast.success(`Updated customer: ${customerName}`);
          }
        } else {
          // Create new customer with all provided information
          const customerResponse = await axios.post(`${API_URL}/customers`, {
            name: customerName,
            primaryPhone: formData.customerPhone || undefined,
            primaryEmail: formData.customerEmail || undefined,
            address: (formData.customerAddress.street || formData.customerAddress.city) 
              ? formData.customerAddress 
              : undefined,
          });
          customerId = customerResponse.data._id;
          toast.success(`Created new customer: ${customerName}`);
        }
      } catch (customerError) {
        console.error('Error finding/creating customer:', customerError);
        if (customerError.response?.data?.error) {
          toast.error(`Customer error: ${customerError.response.data.error}`);
        } else {
          toast.error('Failed to find or create customer');
        }
        return;
      }
      
      // Create the job
      const jobData = {
        title: formData.title.trim(),
        customerId: customerId,
        stage: 'ESTIMATE_IN_PROGRESS',
        source: formData.source,
      };

      // Only include valueEstimated if it's provided and valid
      if (formData.valueEstimated && !isNaN(formData.valueEstimated)) {
        jobData.valueEstimated = parseFloat(formData.valueEstimated);
      }

      const response = await axios.post(`${API_URL}/jobs`, jobData);
      toast.success('Job created successfully');
      
      if (onJobCreated) {
        onJobCreated(response.data);
      }
      
      onClose();
    } catch (error) {
      console.error('Error creating job:', error);
      if (error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error('Failed to create job');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Job</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Job Title"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            required
            error={!!errors.title}
            helperText={errors.title}
            fullWidth
            autoFocus
          />

          <TextField
            label="Customer Name"
            value={formData.customerName}
            onChange={(e) => handleChange('customerName', e.target.value)}
            required
            error={!!errors.customerName}
            helperText={errors.customerName || 'Enter customer name (will be created if it doesn\'t exist)'}
            fullWidth
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Phone"
              value={formData.customerPhone}
              onChange={(e) => handleChange('customerPhone', e.target.value)}
              fullWidth
              placeholder="(949) 555-1234"
            />
            <TextField
              label="Email"
              value={formData.customerEmail}
              onChange={(e) => handleChange('customerEmail', e.target.value)}
              type="email"
              fullWidth
              placeholder="customer@example.com"
            />
          </Box>

          <TextField
            label="Street Address"
            value={formData.customerAddress.street}
            onChange={(e) => handleAddressChange('street', e.target.value)}
            fullWidth
            placeholder="123 Main St"
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="City"
              value={formData.customerAddress.city}
              onChange={(e) => handleAddressChange('city', e.target.value)}
              sx={{ flex: 1 }}
              placeholder="San Clemente"
              fullWidth
            />
            <TextField
              label="State"
              value={formData.customerAddress.state}
              onChange={(e) => handleAddressChange('state', e.target.value)}
              sx={{ width: 100 }}
              placeholder="CA"
            />
            <TextField
              label="ZIP"
              value={formData.customerAddress.zip}
              onChange={(e) => handleAddressChange('zip', e.target.value)}
              sx={{ width: 120 }}
              placeholder="92672"
            />
          </Box>

          <TextField
            label="Estimated Value"
            type="number"
            value={formData.valueEstimated}
            onChange={(e) => handleChange('valueEstimated', e.target.value)}
            error={!!errors.valueEstimated}
            helperText={errors.valueEstimated}
            fullWidth
            inputProps={{ min: 0, step: 0.01 }}
          />

          <FormControl fullWidth>
            <InputLabel>Source</InputLabel>
            <Select
              value={formData.source}
              onChange={(e) => handleChange('source', e.target.value)}
              label="Source"
            >
              {SOURCE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ mt: 1, p: 1.5, bgcolor: 'info.light', borderRadius: 1 }}>
            <Box sx={{ fontSize: '0.875rem', color: 'info.dark' }}>
              <strong>Note:</strong> New jobs will be created in the <strong>Estimate Current, first 5 days</strong> stage.
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={saving}
        >
          {saving ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
          Create Job
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddJobModal;

