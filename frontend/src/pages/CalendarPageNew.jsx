import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  CircularProgress,
  Card,
  CardContent,
  Menu,
  ListItemIcon,
  ListItemText,
  useTheme,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Today as TodayIcon,
  CheckCircle as CheckCircleIcon,
  DragIndicator as DragIndicatorIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, startOfWeek, endOfWeek, isSameDay, addDays } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Installer order - fixed priority list
const INSTALLER_ORDER = [
  'Nick',
  'Walter',
  'Ed',
  'Moris',
  'Eder',
  'Hayden'
];

// Event creation/edit modal
function EventModal({ open, onClose, selectedDate, job, onSave }) {
  const [formData, setFormData] = useState({
    title: '',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '17:00',
    allDay: true,
    recurrence: 'none', // none, daily, weekly, monthly, yearly
    recurrenceCount: 1,
    description: '',
    jobId: null,
    color: '#1976D2', // Default blue
    installer: '', // Installer name
  });
  const [availableJobs, setAvailableJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Set default dates from selected date or job
      const date = selectedDate || (job?.schedule?.startDate ? new Date(job.schedule.startDate) : new Date());
      const dateStr = format(date, 'yyyy-MM-dd');
      
      setFormData({
        title: job?.title || '',
        startDate: dateStr,
        startTime: '09:00',
        endDate: job?.schedule?.endDate ? format(new Date(job.schedule.endDate), 'yyyy-MM-dd') : dateStr,
        endTime: '17:00',
        allDay: true,
        recurrence: job?.schedule?.recurrence?.type || 'none',
        recurrenceCount: job?.schedule?.recurrence?.count || 1,
        description: job?.customerId?.name ? `Customer: ${job.customerId.name}` : '',
        jobId: job?._id || null,
        color: job?.color || '#1976D2',
        installer: job?.schedule?.installer || '',
      });

      // Fetch available jobs
      fetchAvailableJobs();
    }
  }, [open, selectedDate, job]);

  const fetchAvailableJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs`);
      const jobs = response.data.jobs || response.data || [];
      setAvailableJobs(jobs.filter(j => !j.isArchived && !j.isDeadEstimate));
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      setLoading(true);

      // If jobId is selected, update the job's schedule
      if (formData.jobId) {
        const startDateTime = formData.allDay 
          ? new Date(formData.startDate + 'T00:00:00')
          : new Date(formData.startDate + 'T' + formData.startTime);
        const endDateTime = formData.allDay
          ? new Date(formData.endDate + 'T23:59:59')
          : new Date(formData.endDate + 'T' + formData.endTime);

        await axios.patch(`${API_URL}/jobs/${formData.jobId}`, {
          title: formData.title,
          schedule: {
            startDate: startDateTime.toISOString(),
            endDate: endDateTime.toISOString(),
            installer: formData.installer,
            recurrence: {
              type: formData.recurrence,
              interval: 1,
              count: formData.recurrenceCount,
            },
          },
          stage: 'SCHEDULED',
          color: formData.color,
        });

        toast.success('Job scheduled successfully');

        // Sync to Google Calendar (recurrence is handled in backend)
        try {
          await axios.post(`${API_URL}/calendar/jobs/${formData.jobId}/sync`);
        } catch (calendarError) {
          // Don't fail if Google Calendar sync fails
          console.warn('Google Calendar sync failed:', calendarError);
          const errorMessage = calendarError.response?.data?.error || calendarError.message;
          if (errorMessage.includes('not configured') || errorMessage.includes('503')) {
            toast('Google Calendar not configured', { icon: 'ℹ️' });
          } else {
            toast.error(`Calendar sync failed: ${errorMessage}`, { duration: 4000 });
          }
        }
      } else {
        // Create a standalone calendar event (could be stored separately)
        toast.info('Standalone events coming soon');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save event';
      console.error('Error details:', {
        message: errorMessage,
        status: error.response?.status,
        data: error.response?.data
      });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };


  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          m: { xs: 1, sm: 2 },
          maxHeight: { xs: '95vh', sm: '90vh' },
        }
      }}
    >
      <DialogTitle>{job ? 'Edit Event' : 'Create Event'}</DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            fullWidth
            required
          />

          <FormControl fullWidth>
            <InputLabel>Job (Optional)</InputLabel>
            <Select
              value={formData.jobId || ''}
              onChange={(e) => {
                const selectedJob = availableJobs.find(j => j._id === e.target.value);
                setFormData({ 
                  ...formData, 
                  jobId: e.target.value || null,
                  title: selectedJob?.title || formData.title,
                  color: selectedJob?.color || formData.color,
                });
              }}
              label="Job (Optional)"
            >
              <MenuItem value="">None</MenuItem>
              {availableJobs.map((j) => (
                <MenuItem key={j._id} value={j._id}>
                  {j.title} - {j.customerId?.name || 'Unknown'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Installer</InputLabel>
            <Select
              value={formData.installer}
              onChange={(e) => setFormData({ ...formData, installer: e.target.value })}
              label="Installer"
            >
              <MenuItem value="">None</MenuItem>
              {INSTALLER_ORDER.map((installer) => (
                <MenuItem key={installer} value={installer}>
                  {installer}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <input
              type="checkbox"
              checked={formData.allDay}
              onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
              id="allDay"
            />
            <label htmlFor="allDay">All day</label>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Start Date"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            {!formData.allDay && (
              <TextField
                label="Start Time"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="End Date"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            {!formData.allDay && (
              <TextField
                label="End Time"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}
          </Box>

          <FormControl fullWidth>
            <InputLabel>Repeat</InputLabel>
            <Select
              value={formData.recurrence}
              onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
              label="Repeat"
            >
              <MenuItem value="none">Does not repeat</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>

          {formData.recurrence !== 'none' && (
            <TextField
              label="Number of occurrences"
              type="number"
              value={formData.recurrenceCount}
              onChange={(e) => setFormData({ ...formData, recurrenceCount: parseInt(e.target.value) || 1 })}
              fullWidth
              inputProps={{ min: 1, max: 365 }}
            />
          )}

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" sx={{ minWidth: 100 }}>
              Color:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
              {[
                { name: 'Blue', value: '#1976D2' },
                { name: 'Green', value: '#4CAF50' },
                { name: 'Orange', value: '#FF9800' },
                { name: 'Red', value: '#F44336' },
                { name: 'Purple', value: '#9C27B0' },
                { name: 'Teal', value: '#009688' },
                { name: 'Pink', value: '#E91E63' },
                { name: 'Brown', value: '#795548' },
              ].map((colorOption) => (
                <Box
                  key={colorOption.value}
                  onClick={() => setFormData({ ...formData, color: colorOption.value })}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: colorOption.value,
                    cursor: 'pointer',
                    border: formData.color === colorOption.value ? '3px solid #000' : '2px solid #ccc',
                    boxShadow: formData.color === colorOption.value ? '0 0 0 2px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    },
                  }}
                  title={colorOption.name}
                />
              ))}
            </Box>
            <TextField
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              sx={{
                width: 60,
                height: 40,
                '& input': {
                  cursor: 'pointer',
                  padding: 0,
                  border: 'none',
                },
              }}
              title="Custom color"
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        {job && (
          <Button 
            onClick={async () => {
              if (!window.confirm(`Are you sure you want to remove "${job.title}" from the calendar?`)) {
                return;
              }
              try {
                setLoading(true);
                await axios.patch(`${API_URL}/jobs/${job._id}`, {
                  schedule: {
                    startDate: null,
                    endDate: null
                  },
                  stage: 'READY_TO_SCHEDULE',
                });

                // Remove from Google Calendar if synced
                try {
                  await axios.delete(`${API_URL}/calendar/jobs/${job._id}/sync`);
                } catch (calendarError) {
                  console.warn('Google Calendar removal failed:', calendarError);
                }

                toast.success('Job removed from calendar');
                onSave();
                onClose();
              } catch (error) {
                console.error('Error removing job from calendar:', error);
                toast.error('Failed to remove job from calendar');
              } finally {
                setLoading(false);
              }
            }}
            color="error"
            disabled={loading}
            startIcon={<DeleteIcon />}
          >
            Remove from Calendar
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Calendar Day Component
function CalendarDay({ date, isCurrentMonth, events, onDayClick, onEventClick, onEventDelete }) {
  const theme = useTheme();
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuEvent, setContextMenuEvent] = useState(null);

  const dayEvents = events.filter(e => {
    if (!e.schedule?.startDate) return false;
    const startDate = new Date(e.schedule.startDate);
    const endDate = e.schedule.endDate ? new Date(e.schedule.endDate) : startDate;
    
    // Check if date falls within the event range
    const dateStr = format(date, 'yyyy-MM-dd');
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    
    return dateStr >= startStr && dateStr <= endStr;
  })
  // Sort events by installer order, then by date (older first, so new ones appear below)
  .sort((a, b) => {
    const installerA = a.schedule?.installer || '';
    const installerB = b.schedule?.installer || '';
    
    // Get installer order indices
    const indexA = INSTALLER_ORDER.indexOf(installerA);
    const indexB = INSTALLER_ORDER.indexOf(installerB);
    
    // If both have installers, sort by installer order
    if (indexA !== -1 && indexB !== -1) {
      if (indexA !== indexB) {
        return indexA - indexB; // Sort by installer order
      }
    } else if (indexA !== -1) {
      return -1; // A has installer, B doesn't - A comes first
    } else if (indexB !== -1) {
      return 1; // B has installer, A doesn't - B comes first
    }
    // If neither has installer or same installer, sort by date (older first)
    const dateA = new Date(a.schedule?.startDate || a.createdAt || 0);
    const dateB = new Date(b.schedule?.startDate || b.createdAt || 0);
    return dateA - dateB; // Ascending: older first
  });

  const handleContextMenu = (e, event) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: e.clientX + 2,
            mouseY: e.clientY - 6,
          }
        : null
    );
    setContextMenuEvent(event);
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
    setContextMenuEvent(null);
  };

  const handleDelete = () => {
    if (contextMenuEvent && onEventDelete) {
      onEventDelete(contextMenuEvent);
    }
    handleCloseContextMenu();
  };

  return (
    <>
      <Paper
        sx={{
          aspectRatio: '1 / 1', // Make it square
          width: '100%',
          height: '100%',
          p: 1,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: isCurrentMonth 
            ? theme.palette.background.paper 
            : (theme.palette.mode === 'dark' ? '#1A1A1A' : '#fafafa'),
          opacity: isCurrentMonth ? 1 : 0.6,
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          '&:hover': {
            backgroundColor: isCurrentMonth 
              ? (theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5') 
              : (theme.palette.mode === 'dark' ? '#1E1E1E' : '#f0f0f0'),
          },
        }}
        onClick={() => onDayClick(date)}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: isToday(date) ? 700 : 500,
            color: isToday(date) ? 'primary.main' : isCurrentMonth ? 'text.primary' : 'text.secondary',
            mb: 0.5,
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
          }}
        >
          {format(date, 'd')}
        </Typography>
        
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 0.5,
          position: 'relative',
          flex: 1,
          overflow: 'hidden'
        }}>
          {dayEvents.slice(0, 10).map((event) => (
              <Chip
                key={event._id}
                label={event.title}
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(event);
                }}
                onContextMenu={(e) => handleContextMenu(e, event)}
                sx={{
                  fontSize: { xs: '0.6rem', sm: '0.7rem' },
                  height: { xs: 18, sm: 20 },
                  backgroundColor: event.color || '#1976D2',
                  color: 'white',
                  flexShrink: 0,
                  '& .MuiChip-label': {
                    px: { xs: 0.5, sm: 1 },
                  },
                  '&:hover': {
                    opacity: 0.8,
                    transform: 'scale(1.05)',
                  },
                }}
              />
            ))}
          {dayEvents.length > 10 && (
            <Typography variant="caption" color="text.secondary">
              +{dayEvents.length - 10} more
            </Typography>
          )}
        </Box>
      </Paper>
      
      {/* Context Menu */}
      {contextMenuEvent && (
        <Menu
          open={contextMenu !== null}
          onClose={handleCloseContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
        >
          <MenuItem onClick={handleDelete}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove from Calendar</ListItemText>
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

// Bench Job Card Component
function BenchJobCard({ job, onJobClick }) {
  const jobTotal = job.valueEstimated || job.valueTotal || 0;
  const defaultDuration = Math.max(1, Math.floor(jobTotal / 2000));

  return (
    <Card
      onClick={() => onJobClick(job)}
      sx={{
        cursor: 'pointer',
        borderLeft: `4px solid ${job.color || '#1976D2'}`,
        minWidth: 150,
        maxWidth: 180,
        '&:hover': {
          boxShadow: 2,
          transform: 'translateY(-1px)',
          transition: 'all 0.2s',
        },
      }}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
          {defaultDuration} days
        </Typography>
      </CardContent>
    </Card>
  );
}

// Scheduled Job Card Component (with green checkmark)
function ScheduledJobCard({ job, onJobClick, onJobDelete }) {
  const jobTotal = job.valueEstimated || job.valueTotal || 0;
  const defaultDuration = Math.max(1, Math.floor(jobTotal / 2000));

  return (
    <Card
      sx={{
        borderLeft: `4px solid ${job.color || '#4caf50'}`,
        minWidth: 150,
        maxWidth: 180,
        position: 'relative',
        '&:hover': {
          boxShadow: 2,
          transform: 'translateY(-1px)',
          transition: 'all 0.2s',
        },
      }}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 18 }} />
          <Box 
            sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            onClick={() => onJobClick(job)}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {defaultDuration} days
            </Typography>
          </Box>
          {onJobDelete && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onJobDelete(job);
              }}
              sx={{
                padding: 0.5,
                '&:hover': {
                  backgroundColor: 'error.light',
                  color: 'error.main',
                },
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function CalendarPageNew() {
  const theme = useTheme();
  const { canModifyCalendar, canViewCalendar } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [benchJobs, setBenchJobs] = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [benchHeight, setBenchHeight] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const [isBenchMinimized, setIsBenchMinimized] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, [currentDate]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/jobs`);
      const allJobs = response.data.jobs || response.data || [];
      
      // Filter bench jobs (job readiness phase)
      const readinessStages = ['DEPOSIT_PENDING', 'JOB_PREP', 'TAKEOFF_COMPLETE', 'READY_TO_SCHEDULE'];
      const bench = allJobs.filter(job => 
        readinessStages.includes(job.stage) && 
        !job.isArchived && 
        !job.isDeadEstimate
      );
      
      // Filter scheduled jobs
      const scheduled = allJobs.filter(job => {
        const hasSchedule = job.schedule?.startDate;
        const isScheduledStage = job.stage === 'SCHEDULED';
        return (hasSchedule || isScheduledStage) && !job.isArchived && !job.isDeadEstimate;
      });
      
      setBenchJobs(bench);
      setScheduledJobs(scheduled);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  // Generate calendar days for a specific month
  const getCalendarDaysForMonth = (date) => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  };

  // Get three months: current, next, and next+1
  const months = useMemo(() => {
    return [
      currentDate,
      addMonths(currentDate, 1),
      addMonths(currentDate, 2),
    ];
  }, [currentDate]);

  const handleDayClick = (date) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to create or modify calendar events');
      return;
    }
    setSelectedDate(date);
    setSelectedJob(null);
    setEventModalOpen(true);
  };

  const handleEventClick = (job) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    setSelectedJob(job);
    setSelectedDate(job.schedule?.startDate ? new Date(job.schedule.startDate) : new Date());
    setEventModalOpen(true);
  };

  const handleEventDelete = async (job) => {
    if (!canModifyCalendar()) {
      toast.error('You do not have permission to modify calendar events');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to remove "${job.title}" from the calendar?`)) {
      return;
    }

    try {
      await axios.patch(`${API_URL}/jobs/${job._id}`, {
        schedule: {
          startDate: null,
          endDate: null
        },
        stage: 'READY_TO_SCHEDULE',
      });

      // Remove from Google Calendar if synced
      try {
        await axios.delete(`${API_URL}/calendar/jobs/${job._id}/sync`);
      } catch (calendarError) {
        console.warn('Google Calendar removal failed:', calendarError);
      }

      toast.success('Job removed from calendar');
      await fetchJobs();
    } catch (error) {
      console.error('Error removing job from calendar:', error);
      toast.error('Failed to remove job from calendar');
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(addMonths(currentDate, -1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Render a single month calendar
  const renderMonth = (monthDate, monthIndex) => {
    const calendarDays = getCalendarDaysForMonth(monthDate);
    
    return (
      <Box key={monthIndex} sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Month Header */}
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, textAlign: 'center' }}>
          {format(monthDate, 'MMMM yyyy')}
        </Typography>
        
        {/* Day Headers */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <Paper
              key={day}
              sx={{
                p: { xs: 0.5, sm: 1 },
                textAlign: 'center',
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
                border: `1px solid ${theme.palette.divider}`,
                fontWeight: 600,
              }}
            >
              <Typography variant="body2" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>{day}</Typography>
            </Paper>
          ))}
        </Box>

        {/* Calendar Days Grid */}
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, 1fr)', 
          flex: 1,
          gap: 0,
          '& > *': {
            aspectRatio: '1 / 1',
            minHeight: 0,
          }
        }}>
          {calendarDays.map((date, index) => (
            <CalendarDay
              key={index}
              date={date}
              isCurrentMonth={isSameMonth(date, monthDate)}
              events={scheduledJobs}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              onEventDelete={handleEventDelete}
            />
          ))}
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ 
        p: { xs: 1, sm: 2 }, 
        borderBottom: '1px solid #e0e0e0', 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 1, sm: 0 }
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
          <IconButton onClick={handlePrevMonth} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <Typography 
            variant="h5" 
            sx={{ 
              fontWeight: 600, 
              minWidth: { xs: 'auto', sm: 200 }, 
              textAlign: 'center',
              fontSize: { xs: '1rem', sm: '1.5rem' }
            }}
          >
            {format(currentDate, 'MMMM yyyy')} - {format(addMonths(currentDate, 2), 'MMMM yyyy')}
          </Typography>
          <IconButton onClick={handleNextMonth} size="small">
            <ChevronRightIcon />
          </IconButton>
          <Button
            startIcon={<TodayIcon />}
            onClick={handleToday}
            variant="outlined"
            size="small"
            sx={{ display: { xs: 'none', sm: 'flex' } }}
          >
            Today
          </Button>
        </Box>
        {canModifyCalendar() && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setSelectedDate(new Date());
              setSelectedJob(null);
              setEventModalOpen(true);
            }}
            size="small"
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Create Event
          </Button>
        )}
      </Box>

      {/* Calendar Grid - Three Months Stacked Vertically */}
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 1, sm: 2 } }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, sm: 3 } }}>
            {months.map((monthDate, index) => renderMonth(monthDate, index))}
          </Box>
        )}
      </Box>

      {/* Bench Footer - Resizable */}
      <Box
        sx={{
          flexShrink: 0,
          backgroundColor: theme.palette.background.paper,
          borderTop: `3px solid ${theme.palette.divider}`,
          p: isBenchMinimized ? 0 : 2,
          height: isBenchMinimized ? '40px' : `${benchHeight}px`,
          overflow: isBenchMinimized ? 'hidden' : 'auto',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          transition: 'height 0.3s ease, padding 0.3s ease',
        }}
      >
        {/* Minimize/Expand Button */}
        <Box
          sx={{
            position: 'absolute',
            top: isBenchMinimized ? 0 : -3,
            right: 8,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <IconButton
            onClick={() => {
              setIsBenchMinimized(!isBenchMinimized);
              if (!isBenchMinimized) {
                // Store current height before minimizing
                // If it's already minimized, restore to default
                if (benchHeight < 150) {
                  setBenchHeight(250);
                }
              }
            }}
            size="small"
            sx={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
              },
            }}
            title={isBenchMinimized ? 'Expand Bench' : 'Minimize Bench'}
          >
            {isBenchMinimized ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          </IconButton>
        </Box>

        {/* Resize Handle */}
        {!isBenchMinimized && (
          <Box
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsResizing(true);
              const startY = e.clientY;
              const startHeight = benchHeight;
              
              const handleMouseMove = (moveEvent) => {
                moveEvent.preventDefault();
                const deltaY = startY - moveEvent.clientY; // Inverted because we're dragging up
                const newHeight = Math.max(150, Math.min(600, startHeight + deltaY));
                setBenchHeight(newHeight);
              };
              
              const handleMouseUp = () => {
                setIsResizing(false);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
            sx={{
              position: 'absolute',
              top: -3,
              left: 0,
              right: 0,
              height: '16px',
              cursor: 'ns-resize',
              backgroundColor: 'transparent',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '40px',
                  height: '4px',
                  backgroundColor: '#999',
                  borderRadius: '2px',
                },
              },
              '&:active': {
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
              },
              transition: 'background-color 0.2s',
            }}
          />
        )}

        {/* Minimized View */}
        {isBenchMinimized ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1,
              height: '100%',
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5',
              },
            }}
            onClick={() => setIsBenchMinimized(false)}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Bench ({benchJobs.length}) • Scheduled ({scheduledJobs.length})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Click to expand
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 }, height: '100%', mt: 1 }}>
          {/* Bench Jobs - Need to Schedule */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Bench ({benchJobs.length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
              Jobs ready to schedule. Click to schedule on calendar.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 } }}>
              {benchJobs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No jobs on bench
                </Typography>
              ) : (
                benchJobs.map((job) => (
                  <BenchJobCard
                    key={job._id}
                    job={job}
                    onJobClick={(job) => {
                      if (!canModifyCalendar()) {
                        toast.error('You do not have permission to modify calendar events');
                        return;
                      }
                      setSelectedJob(job);
                      setSelectedDate(new Date());
                      setEventModalOpen(true);
                    }}
                  />
                ))
              )}
            </Box>
          </Box>

          {/* Scheduled Jobs - With Green Checkmark */}
          <Box sx={{ 
            flex: 1, 
            minWidth: 0, 
            borderLeft: { xs: 'none', md: '1px solid #e0e0e0' },
            borderTop: { xs: '1px solid #e0e0e0', md: 'none' },
            pl: { xs: 0, md: 3 },
            pt: { xs: 2, md: 0 }
          }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Scheduled ({scheduledJobs.length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
              Jobs with scheduled dates. Click to edit.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 } }}>
              {scheduledJobs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No scheduled jobs
                </Typography>
              ) : (
                scheduledJobs.map((job) => (
                  <ScheduledJobCard
                    key={job._id}
                    job={job}
                    onJobClick={(job) => {
                      if (!canModifyCalendar()) {
                        toast.error('You do not have permission to modify calendar events');
                        return;
                      }
                      setSelectedJob(job);
                      setSelectedDate(job.schedule?.startDate ? new Date(job.schedule.startDate) : new Date());
                      setEventModalOpen(true);
                    }}
                    onJobDelete={handleEventDelete}
                  />
                ))
              )}
            </Box>
          </Box>
          </Box>
        )}
      </Box>

      {/* Event Modal */}
      <EventModal
        open={eventModalOpen}
        onClose={() => {
          setEventModalOpen(false);
          setSelectedDate(null);
          setSelectedJob(null);
        }}
        selectedDate={selectedDate}
        job={selectedJob}
        onSave={fetchJobs}
      />
    </Box>
  );
}

export default CalendarPageNew;

