import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  CircularProgress,
  Chip,
  Divider,
  useTheme,
} from '@mui/material';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function DashboardPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const activitiesRes = await axios
        .get(`${API_URL}/activities/recent?limit=200`)
        .catch(() => ({ data: [] }));

      const allActivities = activitiesRes.data || [];

      // Sort by date (most recent first)
      const combined = [...allActivities].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB - dateA; // Most recent first
      });

      setActivities(combined);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getActivityTitle = (activity) => {
    switch (activity.type) {
      case 'stage_change':
        const STAGE_LABELS = {
          APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
          ESTIMATE_IN_PROGRESS: 'Estimate In Progress',
          ESTIMATE_SENT: 'Estimate Sent',
          ENGAGED_DESIGN_REVIEW: 'Design Review',
          CONTRACT_OUT: 'Contract Out',
          CONTRACT_SIGNED: 'Contract Signed',
          DEPOSIT_PENDING: 'Deposit Pending',
          JOB_PREP: 'Job Prep',
          TAKEOFF_COMPLETE: 'Takeoff Complete',
          READY_TO_SCHEDULE: 'Ready to Schedule',
          SCHEDULED: 'Scheduled',
          IN_PRODUCTION: 'In Production',
          INSTALLED: 'Installed',
          FINAL_PAYMENT_CLOSED: 'Final Payment Closed',
        };
        const fromLabel = activity.fromStage ? (STAGE_LABELS[activity.fromStage] || activity.fromStage) : 'Unknown';
        const toLabel = activity.toStage ? (STAGE_LABELS[activity.toStage] || activity.toStage) : 'Unknown';
        return `Stage Changed: ${fromLabel} → ${toLabel}`;
      case 'note':
        return 'Note';
      case 'job_created':
        return 'Job Created';
      case 'job_updated':
        return 'Job Updated';
      default:
        return activity.type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Activity';
    }
  };

  const getActivityDescription = (activity) => {
    // Prefer explicit note text
    if (activity.note) {
      return activity.note;
    }

    // For job_updated with changes map, show a compact summary of first change
    if (activity.type === 'job_updated' && activity.changes) {
      const entries = Object.entries(activity.changes);
      if (entries.length > 0) {
        const [field, change] = entries[0];
        const fromVal = change?.from ?? 'empty';
        const toVal = change?.to ?? 'empty';
        const more = entries.length > 1 ? ` (+${entries.length - 1} more)` : '';
        return `${field}: ${fromVal} → ${toVal}${more}`;
      }
    }

    // Fall back to job / customer name
    if (activity.jobId?.title) {
      return activity.jobId.title;
    }
    if (activity.customerId?.name) {
      return activity.customerId.name;
    }

    return '';
  };

  const formatActivityTime = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return '';
    }
  };

  const formatActivityDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return format(date, 'MMM dd, yyyy h:mm a');
    } catch (error) {
      return '';
    }
  };

  // Group activities into logical sections
  const jobActivities = activities.filter((a) =>
    ['job_created', 'job_updated', 'job_archived', 'stage_change', 'job_scheduled', 'takeoff_complete', 'value_update'].includes(a.type)
  );

  const fileActivities = activities.filter((a) =>
    ['file_uploaded', 'file_deleted'].includes(a.type)
  );

  const noteActivities = activities.filter((a) => a.type === 'note');

  const appointmentActivities = activities.filter((a) =>
    ['meeting', 'job_scheduled', 'appointment_created'].includes(a.type)
  );

  const taskActivities = activities.filter((a) =>
    ['task_created', 'task_completed'].includes(a.type)
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3, md: 4 }, px: { xs: 1, sm: 2 } }}>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, sm: 3, md: 4 } }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          Dashboard Activity
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
          Most recent updates, in simple lists by type
        </Typography>
      </Box>

      {/* Activity sections as compact lists */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        {activities.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No recent activity
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Helper to render a section */}
            {[
              { title: 'Job Updates', items: jobActivities },
              { title: 'Files', items: fileActivities },
              { title: 'Appointments', items: appointmentActivities },
              { title: 'Tasks / Projects', items: taskActivities },
              { title: 'Notes', items: noteActivities },
            ].map((section) => (
              <Box key={section.title}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    letterSpacing: 0.5,
                    mb: 1,
                    color: 'text.secondary',
                  }}
                >
                  {section.title}
                </Typography>
                {section.items.length === 0 ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontStyle: 'italic' }}
                  >
                    No recent {section.title.toLowerCase()}
                  </Typography>
                ) : (
                  <Box>
                    {section.items.slice(0, 30).map((activity, idx) => {
                      const title = getActivityTitle(activity);
                      const description = getActivityDescription(activity);
                      const timeShort = formatActivityTime(activity.createdAt);
                      const fullDate = formatActivityDate(activity.createdAt);
                      const jobLabel = activity.jobId?.title || '';
                      const customerLabel = activity.customerId?.name || '';
                      const userName = activity.createdBy?.name || '';

                      return (
                        <Box key={activity._id || idx}>
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: '110px 1fr 140px',
                              columnGap: 1.5,
                              py: 0.4,
                              fontSize: '0.8rem',
                            }}
                          >
                            {/* Date / time */}
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              title={fullDate}
                              sx={{ whiteSpace: 'nowrap' }}
                            >
                              {timeShort}
                            </Typography>

                            {/* Main line: type + description */}
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, mr: 0.5 }}
                              >
                                {title}
                              </Typography>
                              {description && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ whiteSpace: 'nowrap' }}
                                >
                                  {' '}- {description}
                                </Typography>
                              )}
                              {(jobLabel || customerLabel) && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    display: 'block',
                                    fontFamily: 'monospace',
                                    fontSize: '0.7rem',
                                  }}
                                >
                                  {jobLabel && `Job: ${jobLabel}`}
                                  {jobLabel && customerLabel && ' | '}
                                  {customerLabel && `Customer: ${customerLabel}`}
                                </Typography>
                              )}
                            </Box>

                            {/* User */}
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                            >
                              {userName}
                            </Typography>
                          </Box>
                          {idx < section.items.length - 1 && (
                            <Divider sx={{ opacity: 0.2 }} />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Container>
  );
}

export default DashboardPage;
