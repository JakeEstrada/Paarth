/**
 * CompletedAppointmentsPage — Historical appointments list.
 * Route: /completed-appointments
 * Docs: ../../../docs/PAGES.md
 */
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
  type ChipProps,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format, subDays, addDays } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** Appointment shape returned by GET /appointments/completed (fields actually rendered below). */
export interface AppointmentRecord {
  _id: string;
  title?: string;
  status?: string;
  date?: string | Date;
  time?: string;
  reason?: string;
  completedAt?: string | Date;
  createdAt?: string | Date;
  customerId?: { name?: string };
}

interface WeekRangeMeta {
  start: Date;
  end: Date;
  key: string;
  label: string;
}

interface WeekBucket {
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
  year: number;
  appointments: AppointmentRecord[];
}

// Helper function to get week range (Friday - Thursday)
const getWeekRange = (date: string | Date): WeekRangeMeta => {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();

  let daysToSubtract: number;
  if (dayOfWeek === 5) daysToSubtract = 0;
  else if (dayOfWeek === 6) daysToSubtract = 1;
  else if (dayOfWeek === 0) daysToSubtract = 2;
  else if (dayOfWeek === 1) daysToSubtract = 3;
  else if (dayOfWeek === 2) daysToSubtract = 4;
  else if (dayOfWeek === 3) daysToSubtract = 5;
  else daysToSubtract = 6;

  const weekStart = subDays(dateObj, daysToSubtract);
  const weekEnd = addDays(weekStart, 6);

  return {
    start: weekStart,
    end: weekEnd,
    key: `${format(weekStart, 'yyyy-MM-dd')}_${format(weekEnd, 'yyyy-MM-dd')}`,
    label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
  };
};

function CompletedAppointmentsPage() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchCompletedAppointments();
  }, []);

  const fetchCompletedAppointments = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await axios.get<{ appointments?: AppointmentRecord[] } | AppointmentRecord[]>(
        `${API_URL}/appointments/completed`,
      );
      const raw = response.data;
      const appointmentsData = Array.isArray(raw) ? raw : raw.appointments ?? [];
      setAppointments(appointmentsData);
    } catch (error) {
      console.error('Error fetching completed appointments:', error);
      toast.error('Failed to load completed appointments');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string | Date | undefined): string => {
    if (!date) return 'Not set';
    return format(new Date(date), 'MMM dd, yyyy');
  };

  const formatDateTime = (date: string | Date | undefined): string => {
    if (!date) return 'Not set';
    return format(new Date(date), 'MMM dd, yyyy h:mm a');
  };

  const organized: Record<string, WeekBucket> = {};
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
        appointments: [],
      };
    }

    organized[weekRange.key].appointments.push(appointment);
  });

  const organizedArray = Object.values(organized).sort(
    (a, b) => b.weekStart.getTime() - a.weekStart.getTime(),
  );

  const getStatusColor = (status: string | undefined): NonNullable<ChipProps['color']> => {
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

  const getStatusLabel = (status: string | undefined): string => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      case 'no_show':
        return 'No Show';
      default:
        return status ?? 'Unknown';
    }
  };

  return (
    <Box>
      <Container maxWidth="xl" sx={{ py: 4 }}>
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
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%',
                      pr: 2,
                    }}
                  >
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
                            appointment.status === 'completed'
                              ? '#43A047'
                              : appointment.status === 'cancelled'
                                ? '#F57C00'
                                : '#D32F2F'
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
