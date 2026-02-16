import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
} from '@mui/material';
import {
  AccountTree as JobsIcon,
  AttachMoney as MoneyIcon,
  CalendarToday as CalendarIcon,
  Assignment as TasksIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  People as PeopleIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format, isToday, isTomorrow, parseISO, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalJobs: 0,
    activeJobs: 0,
    totalRevenue: 0,
    contractedRevenue: 0,
    potentialRevenue: 0,
    jobsByStage: {},
    upcomingAppointments: [],
    pendingTasks: [],
    overdueTasks: [],
    recentActivity: [],
    totalCustomers: 0,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [jobsRes, appointmentsRes, tasksRes, customersRes] = await Promise.all([
        axios.get(`${API_URL}/jobs`),
        axios.get(`${API_URL}/appointments?status=pending&limit=5`),
        axios.get(`${API_URL}/tasks`),
        axios.get(`${API_URL}/customers?limit=1`), // Just to get count
      ]);

      const jobs = jobsRes.data.jobs || jobsRes.data || [];
      const appointments = appointmentsRes.data.appointments || appointmentsRes.data || [];
      const tasks = tasksRes.data.tasks || tasksRes.data || [];
      const customers = customersRes.data.customers || customersRes.data || [];

      // Filter out archived and dead estimates
      const activeJobs = jobs.filter(job => !job.isArchived && !job.isDeadEstimate);

      // Calculate revenue
      const totalRevenue = activeJobs.reduce((sum, job) => sum + (job.valueEstimated || 0), 0);
      const contractedRevenue = activeJobs
        .filter(job => ['DEPOSIT_PENDING', 'JOB_PREP', 'TAKEOFF_COMPLETE', 'READY_TO_SCHEDULE', 'SCHEDULED', 'IN_PRODUCTION', 'INSTALLED', 'FINAL_PAYMENT_CLOSED'].includes(job.stage))
        .reduce((sum, job) => sum + (job.valueContracted || job.valueEstimated || 0), 0);
      const potentialRevenue = activeJobs
        .filter(job => ['APPOINTMENT_SCHEDULED', 'ESTIMATE_IN_PROGRESS', 'ESTIMATE_SENT', 'ENGAGED_DESIGN_REVIEW', 'CONTRACT_OUT'].includes(job.stage))
        .reduce((sum, job) => sum + (job.valueEstimated || 0), 0);

      // Jobs by stage
      const jobsByStage = {};
      activeJobs.forEach(job => {
        jobsByStage[job.stage] = (jobsByStage[job.stage] || 0) + 1;
      });

      // Upcoming appointments (next 7 days)
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const upcomingAppointments = appointments
        .filter(apt => {
          if (!apt.dateTime) return false;
          const aptDate = parseISO(apt.dateTime);
          return aptDate >= now && aptDate <= nextWeek;
        })
        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
        .slice(0, 5);

      // Tasks
      const pendingTasks = tasks.filter(task => !task.completedAt).slice(0, 5);
      const overdueTasks = tasks.filter(task => {
        if (task.completedAt) return false;
        if (!task.dueDate) return false;
        return parseISO(task.dueDate) < now;
      }).slice(0, 5);

      setStats({
        totalJobs: activeJobs.length,
        activeJobs: activeJobs.length,
        totalRevenue,
        contractedRevenue,
        potentialRevenue,
        jobsByStage,
        upcomingAppointments,
        pendingTasks,
        overdueTasks,
        recentActivity: [], // Could fetch from activities endpoint
        totalCustomers: customers.length || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = parseISO(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM dd, yyyy');
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    return format(parseISO(dateString), 'h:mm a');
  };

  const getStageLabel = (stage) => {
    const labels = {
      APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
      ESTIMATE_IN_PROGRESS: 'Estimate In Progress',
      ESTIMATE_SENT: 'Estimate Sent',
      ENGAGED_DESIGN_REVIEW: 'Design Review',
      CONTRACT_OUT: 'Contract Out',
      DEPOSIT_PENDING: 'Deposit Pending',
      JOB_PREP: 'Job Prep',
      TAKEOFF_COMPLETE: 'Takeoff Complete',
      READY_TO_SCHEDULE: 'Ready to Schedule',
      SCHEDULED: 'Scheduled',
      IN_PRODUCTION: 'In Production',
      INSTALLED: 'Installed',
      FINAL_PAYMENT_CLOSED: 'Final Payment Closed',
    };
    return labels[stage] || stage;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Overview of your business at a glance
        </Typography>
      </Box>

      {/* Key Metrics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Active Jobs
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {stats.activeJobs}
                  </Typography>
                </Box>
                <JobsIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Total Pipeline
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {formatCurrency(stats.totalRevenue)}
                  </Typography>
                </Box>
                <MoneyIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Contracted
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {formatCurrency(stats.contractedRevenue)}
                  </Typography>
                </Box>
                <CheckCircleIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%', background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Potential
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {formatCurrency(stats.potentialRevenue)}
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Secondary Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <PeopleIcon sx={{ fontSize: 32, color: 'primary.main', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {stats.totalCustomers}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Customers
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <CalendarIcon sx={{ fontSize: 32, color: 'primary.main', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {stats.upcomingAppointments.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Upcoming Appointments
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <TasksIcon sx={{ fontSize: 32, color: 'primary.main', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {stats.pendingTasks.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pending Tasks
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <WarningIcon sx={{ fontSize: 32, color: 'error.main', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 600, color: 'error.main' }}>
              {stats.overdueTasks.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Overdue Tasks
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Main Content Grid */}
      <Grid container spacing={3}>
        {/* Jobs by Stage */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Jobs by Stage
              </Typography>
              <Button size="small" onClick={() => navigate('/pipeline')}>
                View All
              </Button>
            </Box>
            {Object.keys(stats.jobsByStage).length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No active jobs
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {Object.entries(stats.jobsByStage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => (
                    <Box key={stage} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {getStageLabel(stage)}
                      </Typography>
                      <Chip label={count} color="primary" size="small" />
                    </Box>
                  ))}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Upcoming Appointments */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Upcoming Appointments
              </Typography>
              <Button size="small" onClick={() => navigate('/calendar')}>
                View Calendar
              </Button>
            </Box>
            {stats.upcomingAppointments.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No upcoming appointments
              </Typography>
            ) : (
              <List>
                {stats.upcomingAppointments.map((apt, index) => (
                  <Box key={apt._id || index}>
                    <ListItem>
                      <ListItemIcon>
                        <ScheduleIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body1" sx={{ fontWeight: 500 }}>
                              {apt.jobId?.title || apt.customerId?.name || 'Appointment'}
                            </Typography>
                            <Chip
                              label={`${formatDate(apt.dateTime)} ${formatTime(apt.dateTime)}`}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 0.5 }}>
                            {apt.customerId?.name && (
                              <Typography variant="caption" color="text.secondary">
                                {apt.customerId.name}
                              </Typography>
                            )}
                            {apt.location && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                📍 {apt.location}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < stats.upcomingAppointments.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Pending Tasks */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Pending Tasks
              </Typography>
              <Button size="small" onClick={() => navigate('/tasks')}>
                View All
              </Button>
            </Box>
            {stats.pendingTasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No pending tasks
              </Typography>
            ) : (
              <List>
                {stats.pendingTasks.map((task, index) => (
                  <Box key={task._id || index}>
                    <ListItem>
                      <ListItemIcon>
                        <TasksIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={task.title}
                        secondary={
                          <Box sx={{ mt: 0.5 }}>
                            {task.dueDate && (
                              <Typography variant="caption" color="text.secondary">
                                Due: {formatDate(task.dueDate)}
                              </Typography>
                            )}
                            {task.assignedTo?.name && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                Assigned to: {task.assignedTo.name}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < stats.pendingTasks.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Overdue Tasks */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%', border: stats.overdueTasks.length > 0 ? '2px solid' : 'none', borderColor: 'error.main' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: stats.overdueTasks.length > 0 ? 'error.main' : 'inherit' }}>
                Overdue Tasks
              </Typography>
              <Button size="small" onClick={() => navigate('/tasks')}>
                View All
              </Button>
            </Box>
            {stats.overdueTasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No overdue tasks 🎉
              </Typography>
            ) : (
              <List>
                {stats.overdueTasks.map((task, index) => (
                  <Box key={task._id || index}>
                    <ListItem>
                      <ListItemIcon>
                        <WarningIcon color="error" />
                      </ListItemIcon>
                      <ListItemText
                        primary={task.title}
                        secondary={
                          <Box sx={{ mt: 0.5 }}>
                            {task.dueDate && (
                              <Typography variant="caption" color="error">
                                Overdue since: {formatDate(task.dueDate)}
                              </Typography>
                            )}
                            {task.assignedTo?.name && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                Assigned to: {task.assignedTo.name}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < stats.overdueTasks.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default DashboardPage;

