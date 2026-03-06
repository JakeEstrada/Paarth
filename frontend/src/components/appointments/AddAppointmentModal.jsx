import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function AddAppointmentModal({ open, onClose, onSuccess, job, appointmentId }) {
  const isEditMode = Boolean(appointmentId);

  // Set default date to today
  const getDefaultDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getDefaultTime = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(getDefaultDate());
  const [time, setTime] = useState(getDefaultTime());
  const [loading, setLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Fetch customers
  const fetchCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const response = await axios.get(`${API_URL}/customers?limit=1000`);
      setCustomers(response.data.customers || response.data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Fetch jobs for selected customer
  const fetchJobsForCustomer = async (customerId) => {
    if (!customerId) {
      setJobs([]);
      setSelectedJobId('');
      return;
    }

    try {
      setLoadingJobs(true);
      const response = await axios.get(`${API_URL}/jobs?customerId=${customerId}`);
      const jobsData = response.data.jobs || response.data || [];
      setJobs(jobsData);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to load jobs');
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  };

  // Handle customer selection change
  const handleCustomerChange = (event) => {
    const customerId = event.target.value;
    setSelectedCustomerId(customerId);
    setSelectedJobId(''); // Reset job selection when customer changes
    fetchJobsForCustomer(customerId);
  };

  // Load an existing appointment when editing
  const loadAppointment = async () => {
    if (!appointmentId) return;

    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/appointments/${appointmentId}`);
      const appt = response.data;

      setTitle(appt.title || '');
      setDescription(appt.reason || '');

      // Set customer and job if they exist
      const customerId = appt.customerId?._id || appt.customerId || '';
      const jobId = appt.jobId?._id || appt.jobId || '';
      
      setSelectedCustomerId(customerId);
      setSelectedJobId(jobId);

      // If customer is set, fetch their jobs
      if (customerId) {
        await fetchJobsForCustomer(customerId);
      }

      // Convert stored Date to yyyy-MM-dd for input
      const apptDate = appt.date ? new Date(appt.date) : new Date();
      const isoDate = apptDate.toISOString().split('T')[0];
      setDate(isoDate);

      // Convert stored time string (e.g. "10:00 AM" or "14:30") to 24h "HH:mm"
      const to24Hour = (timeString) => {
        if (!timeString) return getDefaultTime();

        const trimmed = timeString.trim();

        // If it's already in HH:mm format (no AM/PM), just return it
        if (/^\d{2}:\d{2}$/.test(trimmed)) {
          return trimmed;
        }

        // Parse formats like "10:00 AM" or "2:30 pm"
        const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
        if (!match) {
          return getDefaultTime();
        }

        let [, hStr, mStr, ampm] = match;
        let hour = parseInt(hStr, 10);
        const minutes = mStr;
        const upper = ampm.toUpperCase();

        if (upper === 'PM' && hour !== 12) {
          hour += 12;
        } else if (upper === 'AM' && hour === 12) {
          hour = 0;
        }

        return `${String(hour).padStart(2, '0')}:${minutes}`;
      };

      setTime(to24Hour(appt.time));
    } catch (error) {
      console.error('Error loading appointment:', error);
      toast.error('Failed to load appointment details');
      // Fall back to defaults so user can still edit something
      setTitle(appt?.title || '');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    if (!date) {
      toast.error('Please select a date');
      return;
    }

    if (!time) {
      toast.error('Please enter a time');
      return;
    }

    try {
      setLoading(true);
      
      // Combine date and time into a Date object
      const dateTimeString = `${date}T${time}:00`;
      const dateTime = new Date(dateTimeString);
      
      // Format time for display (e.g., "10:00 AM")
      const [hours, minutes] = time.split(':');
      const hour24 = parseInt(hours, 10);
      const hour12 = hour24 % 12 || 12;
      const ampm = hour24 >= 12 ? 'PM' : 'AM';
      const timeFormatted = `${hour12}:${minutes} ${ampm}`;

      const appointmentData = {
        title: title.trim(),
        reason: description.trim() || undefined,
        date: dateTime,
        time: timeFormatted,
      };

      // Set customer and job if selected
      if (selectedCustomerId) {
        appointmentData.customerId = selectedCustomerId;
      } else {
        appointmentData.customerId = null;
      }

      if (selectedJobId) {
        appointmentData.jobId = selectedJobId;
      } else {
        appointmentData.jobId = null;
      }

      // When creating, set status
      if (!isEditMode) {
        appointmentData.status = 'scheduled';

        // If job prop is provided (from job modal), use it as default
        if (job && job._id && !selectedJobId) {
          appointmentData.jobId = job._id;
          if (job.customerId) {
            appointmentData.customerId = job.customerId._id || job.customerId;
          }
        }
      }

      if (isEditMode) {
        await axios.patch(`${API_URL}/appointments/${appointmentId}`, appointmentData);
        toast.success('Appointment updated successfully');
      } else {
        await axios.post(`${API_URL}/appointments`, appointmentData);
        toast.success('Appointment created successfully');
      }
      
      // Reset form
      setTitle('');
      setDescription('');
      setDate(getDefaultDate());
      setTime(getDefaultTime());
      setSelectedCustomerId('');
      setSelectedJobId('');
      setJobs([]);
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error creating appointment:', error);
      toast.error(error.response?.data?.error || 'Failed to create appointment');
    } finally {
      setLoading(false);
    }
  };

  // Reset or load data when modal opens
  useEffect(() => {
    if (!open) return;

    // Fetch customers when modal opens
    fetchCustomers();

    if (isEditMode) {
      loadAppointment();
    } else {
      setTitle('');
      setDescription('');
      setDate(getDefaultDate());
      setTime(getDefaultTime());
      setSelectedCustomerId('');
      setSelectedJobId('');
      setJobs([]);

      // If job prop is provided, set it as default
      if (job && job._id) {
        const customerId = job.customerId?._id || job.customerId;
        if (customerId) {
          setSelectedCustomerId(customerId);
          fetchJobsForCustomer(customerId).then(() => {
            setSelectedJobId(job._id);
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointmentId]);

  const handleClose = () => {
    if (!loading) {
      setTitle('');
      setDescription('');
      setDate(getDefaultDate());
      setTime(getDefaultTime());
      setSelectedCustomerId('');
      setSelectedJobId('');
      setJobs([]);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {isEditMode ? 'Edit Appointment' : 'Add New Appointment'}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              fullWidth
              autoFocus
            />
            
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Optional description or reason for the appointment"
            />
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  fullWidth
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  fullWidth
                  InputLabelProps={{
                    shrink: true,
                  }}
                  inputProps={{
                    step: 300, // 5 minutes
                  }}
                />
              </Grid>
            </Grid>

            <FormControl fullWidth>
              <InputLabel>Customer (Optional)</InputLabel>
              <Select
                value={selectedCustomerId}
                onChange={handleCustomerChange}
                label="Customer (Optional)"
                disabled={loadingCustomers}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {customers.map((customer) => (
                  <MenuItem key={customer._id} value={customer._id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedCustomerId && (
              <FormControl fullWidth>
                <InputLabel>Job (Optional)</InputLabel>
                <Select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  label="Job (Optional)"
                  disabled={loadingJobs}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {loadingJobs ? (
                    <MenuItem disabled>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} />
                        <Typography variant="body2">Loading jobs...</Typography>
                      </Box>
                    </MenuItem>
                  ) : (
                    jobs.map((job) => (
                      <MenuItem key={job._id} value={job._id}>
                        {job.title} {job.description ? `| ${job.description}` : ''}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading}
              sx={{ borderRadius: '8px' }}
            >
              {loading
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save Changes' : 'Create Appointment')}
            </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default AddAppointmentModal;

