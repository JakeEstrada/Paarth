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
  Autocomplete,
  Chip,
  Typography,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
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

function AddJobModal({ open, onClose, onJobCreated, pipelineLayoutId = null, initialStage = null }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    customerId: null,
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
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerInputValue, setCustomerInputValue] = useState('');

  useEffect(() => {
    if (open) {
      // Reset form when modal opens
      setFormData({
        title: '',
        description: '',
        customerId: null,
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
      setCustomerInputValue('');
      fetchCustomers();
    }
  }, [open]);

  const fetchCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const response = await axios.get(`${API_URL}/customers?limit=1000`);
      setCustomers(response.data.customers || response.data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleCustomerChange = (event, newValue, reason) => {
    if (reason === 'selectOption' && newValue) {
      // Check if it's the "Create new" option
      if (newValue._id === 'new') {
        // User wants to create new customer
        setFormData({
          ...formData,
          customerId: null,
          customerName: customerInputValue,
          customerPhone: '',
          customerEmail: '',
          customerAddress: {
            street: '',
            city: '',
            state: '',
            zip: '',
          },
        });
      } else {
        // Customer selected from list
        setFormData({
          ...formData,
          customerId: newValue._id,
          customerName: newValue.name,
          customerPhone: newValue.primaryPhone || '',
          customerEmail: newValue.primaryEmail || '',
          customerAddress: newValue.address || {
            street: '',
            city: '',
            state: '',
            zip: '',
          },
        });
        setCustomerInputValue(newValue.name);
      }
    } else if (reason === 'clear') {
      // Customer cleared
      setFormData({
        ...formData,
        customerId: null,
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerAddress: {
          street: '',
          city: '',
          state: '',
          zip: '',
        },
      });
      setCustomerInputValue('');
    }
  };

  const handleCustomerInputChange = (event, newInputValue, reason) => {
    if (reason === 'reset') {
      return;
    }
    setCustomerInputValue(newInputValue);
    // Empty input must clear stored name — do not use `||` on inputValue or `if (newInputValue)` here
    // or the last character cannot be deleted (empty string is falsy).
    if (newInputValue === '') {
      setFormData((prev) => ({
        ...prev,
        customerId: null,
        customerName: '',
      }));
      return;
    }
    // If user is typing and it doesn't match any customer, treat as new customer
    if (!customers.some((c) => c.name.toLowerCase() === newInputValue.toLowerCase())) {
      setFormData((prev) => ({
        ...prev,
        customerId: null,
        customerName: newInputValue,
      }));
    }
  };

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
    if (!formData.customerName.trim() && !formData.customerId) {
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
      
      // Use existing customer ID if selected, otherwise find or create
      let customerId = formData.customerId;
      const customerName = formData.customerName.trim();
      
      if (!customerId) {
        // Need to find or create customer
        try {
          const existingCustomer = customers.find(
            (c) => c.name.toLowerCase() === customerName.toLowerCase()
          );
          
          if (existingCustomer) {
            customerId = existingCustomer._id;
            // For existing customers, only update if fields are completely missing
            // Don't overwrite existing data - job-specific info will be stored on the job
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
              // Pipeline flow creates the real job next; avoid duplicate "Name — Job" from API
              skipInitialJob: true,
            });
            customerId = customerResponse.data._id;
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
      }
      
      // Create the job
      const jobData = {
        title: formData.title.trim(),
        description: formData.description.trim() || '',
        customerId: customerId,
        stage: (initialStage && String(initialStage).trim()) || 'ESTIMATE_IN_PROGRESS',
        source: formData.source,
      };
      if (pipelineLayoutId) {
        jobData.pipelineLayoutId = pipelineLayoutId;
      }

      // Only include valueEstimated if it's provided and valid
      if (formData.valueEstimated && !isNaN(formData.valueEstimated)) {
        jobData.valueEstimated = parseFloat(formData.valueEstimated);
      }

      // Store job-specific address if provided (for contractors with multiple job sites)
      if (formData.customerAddress.street || formData.customerAddress.city || 
          formData.customerAddress.state || formData.customerAddress.zip) {
        jobData.jobAddress = {
          street: formData.customerAddress.street || undefined,
          city: formData.customerAddress.city || undefined,
          state: formData.customerAddress.state || undefined,
          zip: formData.customerAddress.zip || undefined,
        };
      }

      // Store job-specific contact if different from customer
      if (formData.customerPhone || formData.customerEmail) {
        jobData.jobContact = {
          phone: formData.customerPhone || undefined,
          email: formData.customerEmail || undefined,
        };
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
            label="Description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Add a short description to help identify this job..."
          />

          <Autocomplete
            freeSolo
            options={customers}
            getOptionLabel={(option) => {
              if (typeof option === 'string') return option;
              if (option._id === 'new') return option.name;
              return option.name || '';
            }}
            value={formData.customerId ? customers.find(c => c._id === formData.customerId) || null : null}
            inputValue={customerInputValue}
            onInputChange={handleCustomerInputChange}
            onChange={handleCustomerChange}
            loading={loadingCustomers}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Customer Name"
                required
                error={!!errors.customerName}
                helperText={errors.customerName || 'Select existing customer or type to create new'}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingCustomers ? <CircularProgress size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            renderOption={(props, option) => {
              if (option._id === 'new') {
                return (
                  <Box component="li" {...props} key="new" sx={{ fontStyle: 'italic', color: 'primary.main' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AddIcon fontSize="small" />
                      <Typography variant="body1">{option.name}</Typography>
                    </Box>
                  </Box>
                );
              }
              return (
                <Box component="li" {...props} key={option._id}>
                  <Box>
                    <Typography variant="body1">{option.name}</Typography>
                    {(option.primaryPhone || option.primaryEmail) && (
                      <Typography variant="caption" color="text.secondary">
                        {[option.primaryPhone, option.primaryEmail].filter(Boolean).join(' • ')}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            }}
            filterOptions={(options, params) => {
              const filtered = options.filter((option) =>
                option.name.toLowerCase().includes(params.inputValue.toLowerCase())
              );
              
              // If input doesn't match any option exactly, show "Create new" option
              if (params.inputValue !== '' && !options.some(opt => opt.name.toLowerCase() === params.inputValue.toLowerCase())) {
                return [{ _id: 'new', name: `Create "${params.inputValue}"` }, ...filtered];
              }
              
              return filtered;
            }}
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

