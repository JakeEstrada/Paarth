import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Checkbox,
  IconButton,
  Chip,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Close as CloseIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const dismissButtonSx = {
  color: 'text.disabled',
  opacity: 0.45,
  p: 0.5,
  '&:hover': {
    opacity: 0.85,
    color: 'text.secondary',
    backgroundColor: 'action.hover',
  },
};

function AppointmentList({ onAppointmentClick, onAppointmentComplete, onAddClick, onCountChange, refreshTrigger }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppointments();
  }, [refreshTrigger]);

  useEffect(() => {
    if (onCountChange) {
      onCountChange(appointments.length);
    }
  }, [appointments, onCountChange]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/appointments?status=scheduled`);
      setAppointments(response.data.appointments || response.data);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      console.error('Error response:', error.response?.data);
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (appointmentId, e) => {
    e.stopPropagation();
    try {
      await axios.post(`${API_URL}/appointments/${appointmentId}/complete`);
      toast.success('Appointment marked as completed');
      fetchAppointments();
      if (onAppointmentComplete) {
        onAppointmentComplete();
      }
    } catch (error) {
      console.error('Error completing appointment:', error);
      toast.error('Failed to complete appointment');
    }
  };

  const handleDelete = async (appointmentId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this appointment?')) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/appointments/${appointmentId}`);
      toast.success('Appointment deleted');
      fetchAppointments();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('Failed to delete appointment');
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return format(new Date(date), 'MMM dd, yyyy');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onAddClick}
          sx={{
            borderRadius: '8px',
            textTransform: 'none',
          }}
        >
          Add Appointment
        </Button>
      </Box>
      
      {appointments.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No scheduled appointments
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {appointments.map((appointment) => (
        <Paper
          key={appointment._id}
          onClick={() => onAppointmentClick && onAppointmentClick(appointment._id)}
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <Checkbox
            icon={<RadioButtonUncheckedIcon />}
            checkedIcon={<CheckCircleIcon />}
            checked={false}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => handleComplete(appointment._id, e)}
            sx={{
              color: 'text.primary',
              '&.Mui-checked': { color: 'text.primary' },
            }}
          />
          
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
              {appointment.title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                📅 {formatDate(appointment.date)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                🕐 {appointment.time}
              </Typography>
              {appointment.reason && (
                <Typography variant="body2" color="text.secondary">
                  📝 {appointment.reason}
                </Typography>
              )}
              {appointment.customerId?.name && (
                <Chip
                  label={appointment.customerId.name}
                  size="small"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          </Box>

          <IconButton
            size="small"
            onClick={(e) => handleDelete(appointment._id, e)}
            sx={dismissButtonSx}
            title="Remove"
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default AppointmentList;

