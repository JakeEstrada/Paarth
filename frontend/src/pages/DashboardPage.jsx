import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  CircularProgress,
  Chip,
  Avatar,
  Divider,
  useTheme,
  Card,
  CardContent,
} from '@mui/material';
import {
  Note as NoteIcon,
  Assignment as ProjectIcon,
  CheckCircle as CheckCircleIcon,
  Update as UpdateIcon,
  Event as AppointmentIcon,
  ArrowForward as ArrowForwardIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
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
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch activities and projects in parallel
      const [activitiesRes, tasksRes] = await Promise.all([
        axios.get(`${API_URL}/activities/recent?limit=100`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/tasks`).catch(() => ({ data: [] })),
      ]);

      const allActivities = activitiesRes.data || [];
      const allTasks = tasksRes.data?.tasks || tasksRes.data || [];

      // Filter projects (tasks with isProject=true)
      const projectTasks = allTasks.filter(task => task.isProject === true);
      
      // Create activity items from projects
      const projectActivities = projectTasks.map(task => ({
        _id: task._id,
        type: task.completedAt ? 'project_completed' : 'project_created',
        createdAt: task.completedAt || task.createdAt,
        title: task.title,
        description: task.description,
        completedAt: task.completedAt,
        createdBy: task.createdBy,
        jobId: task.jobId,
        customerId: task.customerId,
        isProject: true,
      }));

      // Combine activities and project activities, sort by date (most recent first)
      const combined = [...allActivities, ...projectActivities].sort((a, b) => {
        const dateA = new Date(a.createdAt || a.createdAt);
        const dateB = new Date(b.createdAt || b.createdAt);
        return dateB - dateA; // Most recent first
      });

      setActivities(combined);
      setProjects(projectTasks);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (activity) => {
    if (activity.isProject) {
      return activity.completedAt ? (
        <CheckCircleIcon sx={{ color: 'success.main' }} />
      ) : (
        <ProjectIcon sx={{ color: 'primary.main' }} />
      );
    }

    switch (activity.type) {
      case 'project_created':
      case 'project_completed':
        return activity.type === 'project_completed' ? (
          <CheckCircleIcon sx={{ color: 'success.main' }} />
        ) : (
          <ProjectIcon sx={{ color: 'primary.main' }} />
        );
      case 'stage_change':
        return <UpdateIcon sx={{ color: 'info.main' }} />;
      case 'note':
        return <NoteIcon sx={{ color: 'warning.main' }} />;
      case 'meeting':
      case 'job_scheduled':
        return <AppointmentIcon sx={{ color: 'secondary.main' }} />;
      case 'task_created':
        return <ProjectIcon sx={{ color: 'primary.main' }} />;
      case 'task_completed':
        return <CheckCircleIcon sx={{ color: 'success.main' }} />;
      default:
        return <NoteIcon sx={{ color: 'text.secondary' }} />;
    }
  };

  const getActivityTitle = (activity) => {
    if (activity.isProject) {
      return activity.completedAt 
        ? `Project Completed: ${activity.title}`
        : `Project Created: ${activity.title}`;
    }

    switch (activity.type) {
      case 'project_created':
        return `Project Created: ${activity.title || 'Untitled'}`;
      case 'project_completed':
        return `Project Completed: ${activity.title || 'Untitled'}`;
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
        return 'Note Added';
      case 'meeting':
        return 'Meeting Scheduled';
      case 'job_scheduled':
        return 'Job Scheduled';
      case 'job_created':
        return 'Job Created';
      case 'job_updated':
        return 'Job Updated';
      case 'task_created':
        return 'Task Created';
      case 'task_completed':
        return 'Task Completed';
      default:
        return activity.type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Activity';
    }
  };

  const getActivityDescription = (activity) => {
    if (activity.isProject) {
      return activity.description || '';
    }

    if (activity.note) {
      return activity.note;
    }

    if (activity.jobId?.title) {
      return activity.jobId.title;
    }

    if (activity.customerId?.name) {
      return activity.customerId.name;
    }

    return '';
  };

  const getActivityColor = (activity) => {
    if (activity.isProject) {
      return activity.completedAt ? 'success' : 'primary';
    }

    switch (activity.type) {
      case 'project_completed':
      case 'task_completed':
        return 'success';
      case 'stage_change':
        return 'info';
      case 'note':
        return 'warning';
      case 'meeting':
      case 'job_scheduled':
        return 'secondary';
      default:
        return 'default';
    }
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

  const handleActivityClick = (activity) => {
    if (activity.jobId?._id || activity.jobId) {
      navigate(`/pipeline`);
    } else if (activity.customerId?._id || activity.customerId) {
      navigate(`/customers`);
    }
  };

  // Filter activities by type
  const createdProjects = activities.filter(a => 
    (a.isProject && !a.completedAt) || 
    (a.type === 'project_created' || a.type === 'task_created')
  );

  const completedProjects = activities.filter(a => 
    (a.isProject && a.completedAt) || 
    a.type === 'project_completed' || 
    a.type === 'task_completed'
  );

  const stageChanges = activities.filter(a => a.type === 'stage_change');
  const notes = activities.filter(a => a.type === 'note');
  const appointments = activities.filter(a => 
    a.type === 'meeting' || 
    a.type === 'job_scheduled' ||
    a.type === 'appointment_created'
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
          Activity Feed
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
          Recent activity across projects, jobs, notes, and appointments
        </Typography>
      </Box>

      {/* Activity Feed */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, maxHeight: '80vh', overflowY: 'auto' }}>
        {activities.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body1" color="text.secondary">
              No recent activity
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {activities.map((activity, index) => {
              const icon = getActivityIcon(activity);
              const title = getActivityTitle(activity);
              const description = getActivityDescription(activity);
              const color = getActivityColor(activity);
              const timeAgo = formatActivityTime(activity.createdAt);
              const fullDate = formatActivityDate(activity.createdAt);

              return (
                <Card
                  key={activity._id || index}
                  sx={{
                    cursor: (activity.jobId || activity.customerId) ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    '&:hover': (activity.jobId || activity.customerId) ? {
                      boxShadow: 4,
                      transform: 'translateY(-2px)',
                    } : {},
                  }}
                  onClick={() => handleActivityClick(activity)}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      {/* Icon */}
                      <Avatar
                        sx={{
                          bgcolor: `${theme.palette[color]?.main || theme.palette.primary.main}20`,
                          color: theme.palette[color]?.main || theme.palette.primary.main,
                          width: 48,
                          height: 48,
                        }}
                      >
                        {icon}
                      </Avatar>

                      {/* Content */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 0.5 }}>
                          <Typography variant="body1" sx={{ fontWeight: 600, flex: 1 }}>
                            {title}
                          </Typography>
                          <Chip
                            label={timeAgo}
                            size="small"
                            variant="outlined"
                            title={fullDate}
                            sx={{ flexShrink: 0 }}
                          />
                        </Box>

                        {description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {description}
                          </Typography>
                        )}

                        {/* Additional info */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                          {activity.jobId?.title && (
                            <Chip
                              label={`Job: ${activity.jobId.title}`}
                              size="small"
                              variant="outlined"
                              color="primary"
                            />
                          )}
                          {activity.customerId?.name && (
                            <Chip
                              label={`Customer: ${activity.customerId.name}`}
                              size="small"
                              variant="outlined"
                              color="secondary"
                            />
                          )}
                          {activity.createdBy?.name && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {activity.createdBy.name}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Paper>

      {/* Summary Stats */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Paper sx={{ p: 2, flex: 1, minWidth: 150 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {createdProjects.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Created Projects/Notes
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, minWidth: 150 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.main' }}>
            {completedProjects.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Completed Projects
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, minWidth: 150 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'info.main' }}>
            {stageChanges.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Stage Changes
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, minWidth: 150 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'warning.main' }}>
            {notes.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Notes Added
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, minWidth: 150 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'secondary.main' }}>
            {appointments.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Appointments
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}

export default DashboardPage;
