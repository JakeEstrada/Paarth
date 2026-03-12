import { useState, useEffect, useRef } from 'react';
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
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
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
  Note as NoteIcon,
  Print as PrintIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format, isToday, isTomorrow, parseISO, formatDistanceToNow } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function DashboardPage() {
  const navigate = useNavigate();
  const theme = useTheme();
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
    urgentTasks: [],
    totalCustomers: 0,
  });
  const [activities, setActivities] = useState([]);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedPrintDate, setSelectedPrintDate] = useState(new Date().toISOString().split('T')[0]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [manualActivityTime, setManualActivityTime] = useState('');
  const [manualActivityNote, setManualActivityNote] = useState('');
  const [savingManualActivity, setSavingManualActivity] = useState(false);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    // Load dashboard data once on mount; no auto-refresh to avoid
    // scrolling the page back to the top while you're reading.
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Only show full-page loading on first load; background refetches keep
      // existing content mounted so scroll position is preserved.
      if (isInitialLoad.current) {
        setLoading(true);
        isInitialLoad.current = false;
      }
      
      // Fetch all data in parallel
      const [jobsRes, appointmentsRes, tasksRes, customersRes, activitiesRes] = await Promise.all([
        axios.get(`${API_URL}/jobs`),
        axios.get(`${API_URL}/appointments?status=scheduled&limit=50`),
        axios.get(`${API_URL}/tasks`),
        axios.get(`${API_URL}/customers?limit=1`),
        axios.get(`${API_URL}/activities/recent?limit=100`).catch(() => ({ data: [] })),
      ]);

      const jobs = jobsRes.data.jobs || jobsRes.data || [];
      const appointments = appointmentsRes.data.appointments || appointmentsRes.data || [];
      const tasks = tasksRes.data.tasks || tasksRes.data || [];
      const customersResData = customersRes.data;
      const customerTotal = customersResData?.total ?? (Array.isArray(customersResData?.customers) ? customersResData.customers.length : 0);
      const allActivities = activitiesRes.data || [];

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

      // Upcoming appointments: scheduled, date in next 7 days (use date field; model has date + time)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const nextWeekEnd = new Date(todayStart.getTime() + 8 * 24 * 60 * 60 * 1000);
      const upcomingAppointments = appointments
        .filter(apt => {
          if (!apt.date) return false;
          const aptDate = new Date(apt.date);
          const aptDayStart = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate(), 0, 0, 0, 0);
          return aptDayStart >= todayStart && aptDayStart < nextWeekEnd;
        })
        .sort((a, b) => {
          const dA = new Date(a.date);
          const dB = new Date(b.date);
          if (dA.getTime() !== dB.getTime()) return dA - dB;
          const tA = (a.time || '').toLowerCase();
          const tB = (b.time || '').toLowerCase();
          return tA.localeCompare(tB);
        })
        .slice(0, 5);

      // Tasks
      const pendingTasks = tasks.filter(task => !task.completedAt).slice(0, 5);
      const urgentTasks = tasks.filter(task => !task.completedAt && !!task.isUrgent).slice(0, 5);

      // Sort activities by date (most recent first)
      const sortedActivities = [...allActivities].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB - dateA;
      });

      setStats({
        totalJobs: activeJobs.length,
        activeJobs: activeJobs.length,
        totalRevenue,
        contractedRevenue,
        potentialRevenue,
        jobsByStage,
        upcomingAppointments,
        pendingTasks,
        urgentTasks,
        totalCustomers: customerTotal,
      });
      setActivities(sortedActivities);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleManualActivitySubmit = async (event) => {
    event.preventDefault();
    if (!manualActivityNote.trim()) {
      toast.error('Please enter what you worked on.');
      return;
    }

    try {
      setSavingManualActivity(true);

      let createdAt;
      if (manualActivityTime) {
        // Use today's date with the supplied time (HH:mm)
        const now = new Date();
        const [hours, minutes] = manualActivityTime.split(':');
        const customDate = new Date(now);
        customDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        createdAt = customDate.toISOString();
      }

      const payload = {
        type: 'manual_entry',
        note: manualActivityNote.trim(),
      };

      if (createdAt) {
        payload.createdAt = createdAt;
      }

      const response = await axios.post(`${API_URL}/activities/manual`, payload);

      // Optimistically prepend the new activity into the feed
      setActivities(prev => [response.data, ...prev]);
      setManualActivityNote('');
      setManualActivityTime('');
      toast.success('Activity added to timeline');
    } catch (error) {
      console.error('Error creating manual activity:', error);
      toast.error('Failed to add activity');
    } finally {
      setSavingManualActivity(false);
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
        return `Stage: ${fromLabel} → ${toLabel}`;
      case 'note':
        return 'Note';
      case 'job_created':
        return 'Job Created';
      case 'job_updated':
        return 'Job Updated';
      case 'job_archived':
        return 'Job Archived';
      case 'file_uploaded':
        return 'File Uploaded';
      case 'file_deleted':
        return 'File Deleted';
      case 'meeting':
      case 'job_scheduled':
        return 'Scheduled';
      case 'appointment_created':
        return 'Appointment Created';
      case 'appointment_completed':
        return 'Appointment Completed';
      case 'appointment_deleted':
        return 'Appointment Deleted';
      case 'task_created':
        return 'Task Created';
      case 'task_deleted':
        return 'Task Deleted';
      case 'project_created':
        return 'Project Created';
      case 'project_updated':
        return 'Project Updated';
      case 'project_deleted':
        return 'Project Deleted';
      case 'task_completed':
        return 'Task Completed';
      case 'project_note_added':
        return 'Project Note Added';
      case 'payroll_printed':
        return 'Payroll Printed';
      default:
        return activity.type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Activity';
    }
  };

  const getActivityDescription = (activity) => {
    if (activity.note) {
      return activity.note;
    }
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
    if (activity.jobId?.title) {
      return activity.jobId.title;
    }
    if (activity.taskId?.title) {
      return activity.taskId.title;
    }
    if (activity.customerId?.name) {
      return activity.customerId.name;
    }
    if (activity.fileName) {
      return activity.fileName;
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

  const handleDeleteClick = (activity) => {
    setActivityToDelete(activity);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activityToDelete) return;

    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/activities/${activityToDelete._id}`);
      toast.success('Activity deleted successfully');
      
      // Remove the activity from the list
      setActivities(activities.filter(a => a._id !== activityToDelete._id));
      
      setDeleteConfirmOpen(false);
      setActivityToDelete(null);
    } catch (error) {
      console.error('Error deleting activity:', error);
      toast.error(error.response?.data?.error || 'Failed to delete activity');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setActivityToDelete(null);
  };

  // Get color for activity type
  const getActivityTypeColor = (type) => {
    const colorMap = {
      // Job-related
      'job_created': 'success',
      'job_updated': 'info',
      'job_archived': 'default',
      'stage_change': 'primary',
      'job_scheduled': 'primary',
      'takeoff_complete': 'success',
      'value_update': 'warning',
      // Files
      'file_uploaded': 'success',
      'file_deleted': 'error',
      // Notes
      'note': 'info',
      'project_note_added': 'info',
      // Appointments
      'meeting': 'primary',
      'appointment_created': 'success',
      'appointment_completed': 'success',
      'appointment_deleted': 'error',
      // Tasks/Projects
      'task_created': 'success',
      'task_deleted': 'error',
      'project_created': 'success',
      'project_updated': 'info',
      'project_deleted': 'error',
      'task_completed': 'success',
      // Payroll
      'payroll_printed': 'info',
      // Other
      'customer_created': 'success',
      'customer_updated': 'info',
      'estimate_sent': 'warning',
      'estimate_updated': 'warning',
      'contract_signed': 'success',
      'deposit_received': 'success',
      'payment_received': 'success',
      'calendar_sync': 'info',
      // Developer tasks
      'developer_task_created': 'info',
      'developer_task_updated': 'info',
      'developer_task_completed': 'success',
      'developer_task_deleted': 'error',
    };
    return colorMap[type] || 'default';
  };

  // Sort all activities by most recent (they should already be sorted, but ensure it)
  const sortedActivities = [...activities].sort((a, b) => {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return dateB - dateA; // Most recent first
  });

  // Handle print
  const handlePrint = () => {
    setPrintDialogOpen(false);
    
    // Filter activities for selected date (handle timezone correctly)
    // Parse the date string and create date in local timezone
    const [year, month, day] = selectedPrintDate.split('-').map(Number);
    const selectedDateObj = new Date(year, month - 1, day, 0, 0, 0, 0); // Local timezone
    const nextDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0); // Next day in local timezone
    
    const filteredActivities = sortedActivities.filter((activity) => {
      const activityDate = new Date(activity.createdAt);
      // Normalize activity date to local date (ignore time)
      const activityDateLocal = new Date(activityDate.getFullYear(), activityDate.getMonth(), activityDate.getDate());
      const selectedDateLocal = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate());
      return activityDateLocal.getTime() === selectedDateLocal.getTime();
    });

    // Group activities by type for summary
    const activityCounts = {};
    filteredActivities.forEach((activity) => {
      const type = activity.type || 'other';
      activityCounts[type] = (activityCounts[type] || 0) + 1;
    });

    // Group activities by customer
    const activitiesByCustomer = {};
    filteredActivities.forEach((activity) => {
      const customerName = activity.customerId?.name || '';
      if (!activitiesByCustomer[customerName]) {
        activitiesByCustomer[customerName] = [];
      }
      activitiesByCustomer[customerName].push(activity);
    });

    const getActivityTitle = (type) => {
      const titles = {
        'stage_change': 'Stage Change',
        'note': 'Note',
        'job_created': 'Job Created',
        'job_updated': 'Job Updated',
        'job_archived': 'Job Archived',
        'file_uploaded': 'File Uploaded',
        'file_deleted': 'File Deleted',
        'meeting': 'Scheduled',
        'job_scheduled': 'Scheduled',
        'appointment_created': 'Appointment Created',
        'appointment_completed': 'Appointment Completed',
        'appointment_deleted': 'Appointment Deleted',
        'task_created': 'Task Created',
        'task_deleted': 'Task Deleted',
        'project_created': 'Project Created',
        'project_updated': 'Project Updated',
        'project_deleted': 'Project Deleted',
        'task_completed': 'Task Completed',
        'project_note_added': 'Project Note Added',
        'payroll_printed': 'Payroll Printed',
        'developer_task_created': 'Developer Task',
        'developer_task_updated': 'Developer Task',
        'developer_task_completed': 'Developer Task Completed',
        'developer_task_deleted': 'Developer Task Deleted',
      };
      return titles[type] || type?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Activity';
    };

    const getActivityDescription = (activity) => {
      if (activity.note) return activity.note;
      if (activity.jobId?.title) return activity.jobId.title;
      if (activity.taskId?.title) return activity.taskId.title;
      if (activity.customerId?.name) return activity.customerId.name;
      if (activity.fileName) return activity.fileName;
      return '';
    };

    const formatDate = (dateString) => {
      if (!dateString) return '';
      try {
        const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
        return format(date, 'MMM dd, yyyy h:mm a');
      } catch (error) {
        return '';
      }
    };

    // Generate summary HTML
    const summaryHTML = Object.entries(activityCounts).map(([type, count]) => `
      <div class="summary-item">
        <div class="summary-item-label">${getActivityTitle(type)}</div>
        <div class="summary-item-value">${count}</div>
      </div>
    `).join('');

    // Sort all filtered activities by most recent first (same as recent activity feed)
    const sortedFilteredActivities = [...filteredActivities].sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB - dateA; // Most recent first
    });

    // Generate activities HTML - maintain chronological order, group consecutive activities by customer
    let currentCustomer = null;
    let activitiesHTML = '';
    
    sortedFilteredActivities.forEach((activity, index) => {
      const customerName = activity.customerId?.name || '';
      const isNewCustomer = customerName !== currentCustomer;
      
      // If new customer, close previous section and start new one
      if (isNewCustomer) {
        if (currentCustomer !== null) {
          activitiesHTML += '</div>'; // Close previous customer section
        }
        // Only show customer name header if there is a customer name
        if (customerName) {
          activitiesHTML += `
            <div class="customer-section">
              <div class="customer-name">${customerName}</div>
          `;
        } else {
          activitiesHTML += `
            <div class="customer-section">
          `;
        }
        currentCustomer = customerName;
      }
      
      const title = getActivityTitle(activity.type);
      const description = getActivityDescription(activity);
      const jobLabel = activity.jobId?.title || '';
      const taskLabel = activity.taskId?.title || '';
      const userName = activity.createdBy?.name || '';
      
      activitiesHTML += `
        <div class="activity-item">
          <div class="activity-header">
            <div class="activity-title">${title}</div>
            <div class="activity-time">${formatDate(activity.createdAt)}</div>
          </div>
          ${description ? `<div class="activity-description">${description}</div>` : ''}
          ${(jobLabel || taskLabel) ? `<div class="activity-meta">${jobLabel ? `Job: ${jobLabel}` : ''}${jobLabel && taskLabel ? ' | ' : ''}${taskLabel ? `${activity.taskId?.isProject ? 'Project' : 'Task'}: ${taskLabel}` : ''}</div>` : ''}
          ${userName ? `<div class="activity-user">by ${userName}</div>` : ''}
        </div>
      `;
    });
    
    // Close last customer section
    if (currentCustomer !== null) {
      activitiesHTML += '</div>';
    }

    // Wait a moment for dialog to close, then trigger print
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Activity Report - ${format(selectedDateObj, 'MMMM dd, yyyy')}</title>
            <style>
                * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
                }
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                  font-size: 12pt;
                  line-height: 1.5;
                  color: #000;
                  padding: 20px;
                }
                img {
                  max-width: 100%;
                  height: auto;
                }
                .header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 20px;
                  padding-bottom: 15px;
                  border-bottom: 2px solid #000;
                }
                .logo-container {
                  display: flex;
                  align-items: center;
                  gap: 15px;
                }
                .logo-container img {
                  height: 60px;
                }
                .summary {
                  margin-bottom: 20px;
                }
                .summary-title {
                  font-size: 14pt;
                  font-weight: 600;
                  margin-bottom: 10px;
                }
                .summary-grid {
                  display: grid;
                  grid-template-columns: repeat(4, 1fr);
                  gap: 10px;
                  margin-bottom: 15px;
                }
                .summary-item {
                  border: 2px solid #000;
                  border-radius: 4px;
                  padding: 10px;
                  text-align: center;
                }
                .summary-item-label {
                  font-size: 10pt;
                  color: #666;
                  margin-bottom: 5px;
                }
                .summary-item-value {
                  font-size: 16pt;
                  font-weight: 600;
                }
                .activities-section {
                  margin-top: 20px;
                }
                .activities-title {
                  font-size: 14pt;
                  font-weight: 600;
                  margin-bottom: 15px;
                }
                .customer-section {
                  margin-bottom: 20px;
                  padding-bottom: 15px;
                  border-bottom: 2px solid #000;
                }
                .customer-section:last-child {
                  border-bottom: none;
                }
                .customer-name {
                  font-weight: 700;
                  font-size: 12pt;
                  margin-bottom: 10px;
                }
                .activity-item {
                  margin-bottom: 10px;
                  padding-left: 15px;
                  border-left: 1px solid #ccc;
                }
                .activity-header {
                  display: flex;
                  justify-content: space-between;
                  align-items: flex-start;
                  margin-bottom: 5px;
                }
                .activity-title {
                  font-weight: 600;
                  font-size: 11pt;
                }
                .activity-time {
                  font-size: 9pt;
                  color: #666;
                }
                .activity-description {
                  font-size: 10pt;
                  margin-bottom: 5px;
                }
                .activity-meta {
                  font-size: 9pt;
                  color: #666;
                  font-family: monospace;
                }
                .activity-user {
                  font-size: 9pt;
                  color: #666;
                  margin-top: 3px;
                }
                @media print {
                  body {
                    padding: 15px;
                  }
                  .header {
                    margin-bottom: 15px;
                    padding-bottom: 10px;
                  }
                  .summary {
                    margin-bottom: 15px;
                  }
                  .customer-section {
                    margin-bottom: 15px;
                    padding-bottom: 10px;
                  }
                  .activity-item {
                    margin-bottom: 8px;
                  }
                }
              </style>
            </head>
            <body>
              <div class="header">
                <div class="logo-container">
                  <img src="${window.location.origin}/logo.png" alt="Logo" />
                  <div>
                    <h1>Activity Report</h1>
                    <p>${format(selectedDateObj, 'EEEE, MMMM dd, yyyy')}</p>
                  </div>
                </div>
              </div>
              
              <div class="summary">
                <div class="summary-title">Summary</div>
                <div class="summary-grid">
                  ${summaryHTML}
                  <div class="summary-item">
                    <div class="summary-item-label">Total Activities</div>
                    <div class="summary-item-value">${filteredActivities.length}</div>
                  </div>
                </div>
              </div>
              
              <div class="activities-section">
                <div class="activities-title">Activities by Customer</div>
                ${activitiesHTML}
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
    }, 100);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1.5, sm: 2 } }}>
      {/* Header */}
      <Box sx={{ mb: { xs: 3, sm: 4 }, pt: { xs: 0.5, sm: 1 } }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            fontSize: { xs: '1.75rem', sm: '2.25rem' },
            lineHeight: 1.3,
            mb: 2,
          }}
        >
          Dashboard
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{
            fontSize: { xs: '0.95rem', sm: '1.05rem' },
            lineHeight: 1.5,
            mt: 0.5,
            display: 'block',
          }}
        >
          Overview of your pipeline and activity
        </Typography>
      </Box>

      {/* Single boxed section: all metrics + panels */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, mb: 3 }} elevation={0} variant="outlined">
        {/* Key metrics - row 1 */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
                    Active Jobs
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {stats.activeJobs}
                  </Typography>
                </Box>
                <JobsIcon sx={{ fontSize: 36, color: 'primary.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
                    Pipeline Value
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {formatCurrency(stats.totalRevenue)}
                  </Typography>
                </Box>
                <MoneyIcon sx={{ fontSize: 36, color: 'primary.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
                    Contracted
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {formatCurrency(stats.contractedRevenue)}
                  </Typography>
                </Box>
                <CheckCircleIcon sx={{ fontSize: 36, color: 'success.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
                    Potential
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {formatCurrency(stats.potentialRevenue)}
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 36, color: 'info.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Secondary stats + panels layout */}
      <Grid container spacing={2} sx={{ mb: 0, alignItems: 'stretch' }}>
        {/* Left column: small tiles stacked vertically */}
        <Grid item xs={12} md={3} lg={3}>
          <Grid container spacing={2} direction="column">
            <Grid item>
              <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }} elevation={0} variant="outlined">
                <PeopleIcon sx={{ fontSize: 28, color: 'primary.main', mb: 0.5 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {stats.totalCustomers}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Customers
                </Typography>
              </Paper>
            </Grid>
            <Grid item>
              <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }} elevation={0} variant="outlined">
                <CalendarIcon sx={{ fontSize: 28, color: 'primary.main', mb: 0.5 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {stats.upcomingAppointments.length}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Upcoming
                </Typography>
              </Paper>
            </Grid>
            <Grid item>
              <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }} elevation={0} variant="outlined">
                <TasksIcon sx={{ fontSize: 28, color: 'primary.main', mb: 0.5 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {stats.pendingTasks.length}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Pending Tasks
                </Typography>
              </Paper>
            </Grid>
            <Grid item>
              <Paper
                sx={{
                  p: 2,
                  textAlign: 'center',
                  borderRadius: 2,
                  borderColor: stats.urgentTasks.length > 0 ? 'error.main' : undefined,
                }}
                elevation={0}
                variant="outlined"
              >
                <WarningIcon
                  sx={{
                    fontSize: 28,
                    color: stats.urgentTasks.length > 0 ? 'error.main' : 'text.secondary',
                    mb: 0.5,
                  }}
                />
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 600, color: stats.urgentTasks.length > 0 ? 'error.main' : 'text.primary' }}
                >
                  {stats.urgentTasks.length}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Urgent
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Grid>

        {/* Right column: panels spanning remaining width */}
        <Grid item xs={12} md={9} lg={9} sx={{ display: 'flex' }}>
          <Grid container spacing={2} sx={{ flex: 1, alignContent: 'stretch' }}>
            {/* Jobs by Stage */}
            <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
              <Paper sx={{ p: 2.5, height: '100%', borderRadius: 2 }} elevation={0} variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Jobs by Stage
                  </Typography>
                  <Button size="small" onClick={() => navigate('/pipeline')} sx={{ textTransform: 'none' }}>
                    View pipeline
                  </Button>
                </Box>
                {Object.keys(stats.jobsByStage).length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    No active jobs
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {Object.entries(stats.jobsByStage)
                      .sort((a, b) => b[1] - a[1])
                      .map(([stage, count]) => (
                        <Box
                          key={stage}
                          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.75 }}
                        >
                          <Typography variant="body2" sx={{ flex: 1 }}>
                            {getStageLabel(stage)}
                          </Typography>
                          <Chip label={count} color="primary" size="small" sx={{ fontWeight: 600 }} />
                        </Box>
                      ))}
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Pending Tasks panel */}
            <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
              <Paper sx={{ p: 2.5, height: '100%', borderRadius: 2 }} elevation={0} variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Pending Tasks
                  </Typography>
                  <Button size="small" onClick={() => navigate('/tasks')} sx={{ textTransform: 'none' }}>
                    View all
                  </Button>
                </Box>
                {stats.pendingTasks.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
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

            {/* Upcoming Appointments - full width under panels */}
            <Grid item xs={12} sx={{ display: 'flex' }}>
              <Paper sx={{ p: 2.5, height: '100%', borderRadius: 2 }} elevation={0} variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Upcoming Appointments
                  </Typography>
                  <Button size="small" onClick={() => navigate('/calendar')} sx={{ textTransform: 'none' }}>
                    View calendar
                  </Button>
                </Box>
                {stats.upcomingAppointments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
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
                                  {apt.jobId?.title || apt.customerId?.name || apt.title || 'Appointment'}
                                </Typography>
                                <Chip
                                  label={`${formatDate(apt.date)}${apt.time ? ` ${apt.time}` : ''}`}
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
          </Grid>
        </Grid>
      </Grid>
      </Paper>

      {/* Recent Activity - full width */}
      <Paper sx={{ p: 2.5, borderRadius: 2 }} elevation={0} variant="outlined">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Recent Activity
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PrintIcon />}
            onClick={() => setPrintDialogOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Print activity
          </Button>
        </Box>

        {/* Quick manual activity entry */}
        <Box
          component="form"
          onSubmit={handleManualActivitySubmit}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            mb: 2,
            alignItems: 'center',
            p: 1.5,
            borderRadius: 1,
            bgcolor: theme.palette.mode === 'dark' ? 'action.hover' : 'grey.50',
          }}
        >
              <TextField
                label="Time"
                type="time"
                size="small"
                value={manualActivityTime}
                onChange={(e) => setManualActivityTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 140 }}
              />
              <TextField
                label="Quick activity note"
                placeholder='e.g. "8:30 worked on Wells Fargo stuff (job – no name)"'
                size="small"
                value={manualActivityNote}
                onChange={(e) => setManualActivityNote(e.target.value)}
                sx={{ flexGrow: 1, minWidth: 220 }}
              />
              <Button
                type="submit"
                variant="contained"
                size="small"
                disabled={savingManualActivity}
                sx={{ textTransform: 'none' }}
              >
                Add to Activity
              </Button>
        </Box>

        {sortedActivities.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No recent activity
          </Typography>
        ) : (
          <Box>
            {sortedActivities.slice(0, 50).map((activity, idx) => {
                  const title = getActivityTitle(activity);
                  const description = getActivityDescription(activity);
                  const timeShort = formatActivityTime(activity.createdAt);
                  const jobLabel = activity.jobId?.title || '';
                  const taskLabel = activity.taskId?.title || '';
                  const customerLabel = activity.customerId?.name || '';
                  const userName = activity.createdBy?.name || '';
                  const typeColor = getActivityTypeColor(activity.type);

                  return (
                    <Box key={activity._id || idx}>
                      <Box sx={{ py: 1, fontSize: '0.75rem', position: 'relative' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Chip 
                            label={title}
                            size="small"
                            color={typeColor}
                            sx={{ 
                              height: 20, 
                              fontSize: '0.65rem',
                              fontWeight: 600
                            }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                            {timeShort}
                          </Typography>
                          <Box sx={{ flexGrow: 1 }} />
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteClick(activity)}
                            sx={{
                              opacity: 0.6,
                              '&:hover': {
                                opacity: 1,
                                color: 'error.main',
                              },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                        {description && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', fontSize: '0.7rem', mb: 0.5 }}
                          >
                            {description}
                          </Typography>
                        )}
                        {(jobLabel || taskLabel || customerLabel) && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              fontSize: '0.65rem',
                              fontFamily: 'monospace',
                              mb: 0.5,
                            }}
                          >
                            {jobLabel && (
                              <Box
                                component="span"
                                onClick={() => {
                                  // jobId can be either an object with _id or just the _id string
                                  const jobId = activity.jobId?._id || activity.jobId;
                                  if (jobId) {
                                    navigate(`/pipeline?jobId=${jobId}`);
                                  }
                                }}
                                sx={{
                                  color: 'primary.main',
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                  '&:hover': {
                                    color: 'primary.dark',
                                  },
                                }}
                              >
                                Job: {jobLabel}
                              </Box>
                            )}
                            {taskLabel && `${jobLabel ? ' | ' : ''}${activity.taskId?.isProject ? 'Project' : 'Task'}: ${taskLabel}`}
                            {(jobLabel || taskLabel) && customerLabel && ' | '}
                            {customerLabel && `Customer: ${customerLabel}`}
                          </Typography>
                        )}
                        {userName && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: '0.65rem' }}
                          >
                            by {userName}
                          </Typography>
                        )}
                      </Box>
                      {idx < Math.min(sortedActivities.length, 50) - 1 && <Divider sx={{ opacity: 0.2 }} />}
                    </Box>
                  );
                })}
          </Box>
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Delete Activity?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this activity? This action cannot be undone.
          </Typography>
          {activityToDelete && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {getActivityTitle(activityToDelete)}
              </Typography>
              {getActivityDescription(activityToDelete) && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {getActivityDescription(activityToDelete)}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={printDialogOpen} onClose={() => setPrintDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Print Activity Report</DialogTitle>
        <DialogContent>
          <TextField
            label="Select Date"
            type="date"
            value={selectedPrintDate}
            onChange={(e) => setSelectedPrintDate(e.target.value)}
            fullWidth
            sx={{ mt: 2 }}
            InputLabelProps={{
              shrink: true,
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintDialogOpen(false)}>Cancel</Button>
          <Button onClick={handlePrint} variant="contained" startIcon={<PrintIcon />}>
            Print
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print View (Hidden until print) */}
      <Box
        id="print-view"
        sx={{
          display: 'none',
          '@media print': {
            display: 'block',
          },
        }}
      >
        <PrintView activities={sortedActivities} selectedDate={selectedPrintDate} />
      </Box>
    </Container>
  );
}

// Print View Component
function PrintView({ activities, selectedDate }) {
  // Filter activities for selected date (handle timezone correctly)
  // Parse the date string and create date in local timezone
  const [year, month, day] = selectedDate.split('-').map(Number);
  const selectedDateObj = new Date(year, month - 1, day, 0, 0, 0, 0); // Local timezone

  // Filter activities for selected date
  const filteredActivities = activities.filter((activity) => {
    const activityDate = new Date(activity.createdAt);
    // Normalize activity date to local date (ignore time)
    const activityDateLocal = new Date(activityDate.getFullYear(), activityDate.getMonth(), activityDate.getDate());
    const selectedDateLocal = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate());
    return activityDateLocal.getTime() === selectedDateLocal.getTime();
  });

  // Group activities by type for summary
  const activityCounts = {};
  filteredActivities.forEach((activity) => {
    const type = activity.type || 'other';
    activityCounts[type] = (activityCounts[type] || 0) + 1;
  });

  // Group activities by customer
  const activitiesByCustomer = {};
  filteredActivities.forEach((activity) => {
    const customerName = activity.customerId?.name || '';
    if (!activitiesByCustomer[customerName]) {
      activitiesByCustomer[customerName] = [];
    }
    activitiesByCustomer[customerName].push(activity);
  });

  const getActivityTitle = (activity) => {
    switch (activity.type) {
      case 'stage_change':
        return 'Stage Change';
      case 'note':
        return 'Note';
      case 'job_created':
        return 'Job Created';
      case 'job_updated':
        return 'Job Updated';
      case 'job_archived':
        return 'Job Archived';
      case 'file_uploaded':
        return 'File Uploaded';
      case 'file_deleted':
        return 'File Deleted';
      case 'meeting':
      case 'job_scheduled':
        return 'Scheduled';
      case 'appointment_created':
        return 'Appointment Created';
      case 'appointment_completed':
        return 'Appointment Completed';
      case 'appointment_deleted':
        return 'Appointment Deleted';
      case 'task_created':
        return 'Task/Project Created';
      case 'task_deleted':
        return 'Task Deleted';
      case 'project_created':
        return 'Project Created';
      case 'project_updated':
        return 'Project Updated';
      case 'project_deleted':
        return 'Project Deleted';
      case 'task_completed':
        return 'Task Completed';
      case 'project_note_added':
        return 'Project Note Added';
      case 'payroll_printed':
        return 'Payroll Printed';
      case 'developer_task_created':
      case 'developer_task_updated':
        return 'Developer Task';
      case 'developer_task_completed':
        return 'Developer Task Completed';
      case 'developer_task_deleted':
        return 'Developer Task Deleted';
      default:
        return activity.type?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Activity';
    }
  };

  const getActivityDescription = (activity) => {
    if (activity.note) {
      return activity.note;
    }
    if (activity.type === 'job_updated' && activity.changes) {
      const entries = Object.entries(activity.changes);
      if (entries.length > 0) {
        const [field, change] = entries[0];
        const fromVal = change?.from ?? 'empty';
        const toVal = change?.to ?? 'empty';
        return `${field}: ${fromVal} → ${toVal}`;
      }
    }
    if (activity.jobId?.title) {
      return activity.jobId.title;
    }
    if (activity.taskId?.title) {
      return activity.taskId.title;
    }
    if (activity.customerId?.name) {
      return activity.customerId.name;
    }
    if (activity.fileName) {
      return activity.fileName;
    }
    return '';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return format(date, 'MMM dd, yyyy h:mm a');
    } catch (error) {
      return '';
    }
  };

  return (
    <Box sx={{ p: 3, '@media print': { p: 2 } }}>
      {/* Header with Logo and Date */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, '@media print': { mb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <img
            src="/logo.png"
            alt="Logo"
            style={{ height: '60px', '@media print': { height: '50px' } }}
          />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, '@media print': { fontSize: '1.25rem' } }}>
              Activity Report
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ '@media print': { fontSize: '0.875rem' } }}>
              {format(selectedDateObj, 'EEEE, MMMM dd, yyyy')}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Summary Section */}
      <Box sx={{ mb: 3, '@media print': { mb: 2 } }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, '@media print': { fontSize: '1rem', mb: 1 } }}>
          Summary
        </Typography>
        <Box 
          sx={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 1.5,
            mb: 2,
            '@media print': { 
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 1,
              mb: 1.5
            }
          }}
        >
          {Object.entries(activityCounts).map(([type, count]) => (
            <Box
              key={type}
              sx={{
                border: '2px solid',
                borderColor: '#000',
                borderRadius: 1,
                p: 1.5,
                textAlign: 'center',
                '@media print': { 
                  p: 1,
                  border: '1.5px solid #000',
                },
              }}
            >
              <Typography 
                variant="body2" 
                sx={{ 
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  mb: 0.5,
                  '@media print': { 
                    fontSize: '0.65rem',
                    mb: 0.25
                  } 
                }}
              >
                {getActivityTitle({ type })}
              </Typography>
              <Typography 
                variant="h5" 
                sx={{ 
                  fontWeight: 700,
                  '@media print': { 
                    fontSize: '1.5rem'
                  } 
                }}
              >
                {count}
              </Typography>
            </Box>
          ))}
        </Box>
        <Box
          sx={{
            border: '2px solid',
            borderColor: '#000',
            borderRadius: 1,
            p: 1.5,
            textAlign: 'center',
            display: 'inline-block',
            '@media print': {
              border: '1.5px solid #000',
              p: 1,
            },
          }}
        >
          <Typography 
            variant="body2" 
            sx={{ 
              fontSize: '0.7rem',
              fontWeight: 500,
              mb: 0.5,
              '@media print': { 
                fontSize: '0.65rem',
                mb: 0.25
              } 
            }}
          >
            Total Activities
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              fontWeight: 700,
              '@media print': { 
                fontSize: '1.5rem'
              } 
            }}
          >
            {filteredActivities.length}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ mb: 3, '@media print': { mb: 2 } }} />

      {/* Activities List - Grouped by Customer */}
      <Box>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, '@media print': { fontSize: '1rem', mb: 1 } }}>
          Activities by Customer
        </Typography>
        {Object.keys(activitiesByCustomer).length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ '@media print': { fontSize: '0.875rem' } }}>
            No activities for this date
          </Typography>
        ) : (
          <Box>
            {Object.entries(activitiesByCustomer)
              .sort(([a], [b]) => {
                // Sort blank customer names to the end
                if (!a && b) return 1;
                if (a && !b) return -1;
                if (!a && !b) return 0;
                return a.localeCompare(b);
              })
              .map(([customerName, customerActivities], customerIdx) => (
                <Box
                  key={customerName || 'no-customer'}
                  sx={{
                    mb: 2,
                    pb: 2,
                    borderBottom: customerIdx < Object.keys(activitiesByCustomer).length - 1 ? '2px solid' : 'none',
                    borderColor: '#000',
                    '@media print': { 
                      mb: 1.5, 
                      pb: 1.5,
                      borderBottom: customerIdx < Object.keys(activitiesByCustomer).length - 1 ? '1.5px solid #000' : 'none',
                    },
                  }}
                >
                  {/* Customer Header - only show if there's a customer name */}
                  {customerName && (
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        fontWeight: 700,
                        mb: 1.5,
                        fontSize: '1.1rem',
                        '@media print': { 
                          fontSize: '1rem',
                          mb: 1,
                          fontWeight: 600
                        } 
                      }}
                    >
                      {customerName}
                    </Typography>
                  )}
                  
                  {/* Activities for this customer */}
                  {customerActivities.map((activity, activityIdx) => {
                    const title = getActivityTitle(activity);
                    const description = getActivityDescription(activity);
                    const jobLabel = activity.jobId?.title || '';
                    const taskLabel = activity.taskId?.title || '';
                    const userName = activity.createdBy?.name || '';

                    return (
                      <Box
                        key={activity._id || activityIdx}
                        sx={{
                          mb: 1,
                          pl: 2,
                          borderLeft: '2px solid',
                          borderColor: 'divider',
                          '@media print': {
                            mb: 0.75,
                            pl: 1.5,
                            borderLeft: '1px solid #ccc',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: 600,
                              '@media print': { 
                                fontSize: '0.85rem',
                                fontWeight: 500
                              } 
                            }}
                          >
                            {title}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              fontSize: '0.7rem',
                              '@media print': { 
                                fontSize: '0.65rem' 
                              } 
                            }}
                          >
                            {formatDate(activity.createdAt)}
                          </Typography>
                        </Box>
                        {description && (
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              mb: 0.5,
                              fontSize: '0.875rem',
                              '@media print': { 
                                fontSize: '0.8rem',
                                mb: 0.25
                              } 
                            }}
                          >
                            {description}
                          </Typography>
                        )}
                        {(jobLabel || taskLabel) && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              fontSize: '0.7rem',
                              fontFamily: 'monospace',
                              '@media print': {
                                fontSize: '0.65rem',
                              },
                            }}
                          >
                            {jobLabel && `Job: ${jobLabel}`}
                            {taskLabel && `${jobLabel ? ' | ' : ''}${activity.taskId?.isProject ? 'Project' : 'Task'}: ${taskLabel}`}
                          </Typography>
                        )}
                        {userName && (
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              fontSize: '0.7rem',
                              '@media print': { 
                                fontSize: '0.65rem' 
                              } 
                            }}
                          >
                            by {userName}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default DashboardPage;
