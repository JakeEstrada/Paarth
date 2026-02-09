import { useState, useEffect } from 'react';
import {
  Typography,
  Container,
  Box,
  Card,
  CircularProgress,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format, subDays, addDays } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Helper function to get week range (Friday - Thursday)
// Week ends on Thursday, so we adjust the start of week
const getWeekRange = (date) => {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 4 = Thursday, 5 = Friday, 6 = Saturday
  
  // Calculate days to subtract to get to Friday
  // If it's Friday (5), subtract 0 days
  // If it's Saturday (6), subtract 1 day
  // If it's Sunday (0), subtract 2 days
  // If it's Monday (1), subtract 3 days
  // If it's Tuesday (2), subtract 4 days
  // If it's Wednesday (3), subtract 5 days
  // If it's Thursday (4), subtract 6 days
  let daysToSubtract;
  if (dayOfWeek === 5) daysToSubtract = 0; // Friday
  else if (dayOfWeek === 6) daysToSubtract = 1; // Saturday
  else if (dayOfWeek === 0) daysToSubtract = 2; // Sunday
  else if (dayOfWeek === 1) daysToSubtract = 3; // Monday
  else if (dayOfWeek === 2) daysToSubtract = 4; // Tuesday
  else if (dayOfWeek === 3) daysToSubtract = 5; // Wednesday
  else daysToSubtract = 6; // Thursday
  
  const weekStart = subDays(dateObj, daysToSubtract);
  const weekEnd = addDays(weekStart, 6); // Thursday (6 days after Friday)
  
  return {
    start: weekStart,
    end: weekEnd,
    key: `${format(weekStart, 'yyyy-MM-dd')}_${format(weekEnd, 'yyyy-MM-dd')}`,
    label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
  };
};

function CompletedAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompletedAppointments();
  }, []);

  const fetchCompletedAppointments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/appointments/completed`);
      const appointmentsData = response.data.appointments || response.data;
      setAppointments(appointmentsData);
    } catch (error) {
      console.error('Error fetching completed appointments:', error);
      toast.error('Failed to load completed appointments');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Not set';
    return format(new Date(date), 'MMM dd, yyyy');
  };

  const formatDateTime = (date) => {
    if (!date) return 'Not set';
    return format(new Date(date), 'MMM dd, yyyy h:mm a');
  };

  // Organize by week (Friday - Thursday)
  const organized = {};
  appointments.forEach((appointment) => {
    const date = appointment.completedAt || appointment.date || appointment.createdAt;
    if (!date) return;
    
    const weekRange = getWeekRange(date);
    
    if (!organized[weekRange.key]) {
      organized[weekRange.key] = {
        weekStart: weekRange.start,
        weekEnd: weekRange.end,
        weekLabel: weekRange.label,
        year: weekRange.start.getFullYear(),
        appointments: []
      };
    }
    
    organized[weekRange.key].appointments.push(appointment);
  });

  const organizedArray = Object.values(organized).sort((a, b) => {
    return b.weekStart - a.weekStart; // Most recent weeks first
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'warning';
      case 'no_show':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      case 'no_show':
        return 'No Show';
      default:
        return status;
    }
  };

  return (
    <Box>
      {/* Main Content */}
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h1" sx={{ mb: 1 }}>
            Completed Appointments
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            History of all completed, cancelled, and no-show appointments
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : organizedArray.length === 0 ? (
          <Card sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No completed appointments yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Completed appointments will appear here
            </Typography>
          </Card>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {organizedArray.map((group) => (
              <Accordion
                key={group.weekLabel}
                defaultExpanded={organizedArray.indexOf(group) === 0}
                sx={{
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  borderRadius: '12px !important',
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    px: 3,
                    py: 2,
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.02)' },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', pr: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        Week of {group.weekLabel}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {group.appointments.length} appointment{group.appointments.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 3, pb: 3 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {group.appointments.map((appointment) => (
                      <Paper
                        key={appointment._id}
                        sx={{
                          p: 2,
                          borderLeft: `4px solid ${
                            appointment.status === 'completed' ? '#43A047' :
                            appointment.status === 'cancelled' ? '#F57C00' :
                            '#D32F2F'
                          }`,
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {appointment.title}
                          </Typography>
                          <Chip
                            label={getStatusLabel(appointment.status)}
                            color={getStatusColor(appointment.status)}
                            size="small"
                          />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
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
                            <Typography variant="body2" color="text.secondary">
                              👤 {appointment.customerId.name}
                            </Typography>
                          )}
                        </Box>
                        {appointment.completedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Completed: {formatDateTime(appointment.completedAt)}
                          </Typography>
                        )}
                      </Paper>
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}

export default CompletedAppointmentsPage;

